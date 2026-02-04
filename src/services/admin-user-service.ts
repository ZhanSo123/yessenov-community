import { type Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { type Role } from "@/lib/auth";
import { buildCursorString } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { UserRepository } from "@/repositories/user-repository";
import { publishDomainEvent } from "@/services/event-publisher";

export type AdminUserActor = { id: string; role: Role };

export type AdminUserListResult =
  | { ok: true; payload: { data: unknown[]; nextCursor: string | null } }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

export type AdminUserMutateResult =
  | { ok: true; payload: { data: unknown } }
  | {
      ok: false;
      code: "NOT_FOUND" | "BAD_REQUEST" | "FORBIDDEN";
      status: 404 | 400 | 403;
    };

const DEFAULT_LIMIT = 50;

export class AdminUserService {
  constructor(private readonly userRepo = new UserRepository()) {}

  async listUsers(params: {
    query?: string | null;
    sortDirection: "asc" | "desc";
    fromDate?: Date | null;
    toDate?: Date | null;
    limit?: number | null;
    cursor: { createdAt: Date; id: string } | null;
  }): Promise<AdminUserListResult> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const filters: Prisma.UserWhereInput[] = [];

    if (params.query) {
      filters.push({
        OR: [
          { email: { contains: params.query, mode: "insensitive" } },
          { username: { contains: params.query, mode: "insensitive" } },
          { name: { contains: params.query, mode: "insensitive" } },
        ],
      });
    }

    if (params.fromDate) {
      filters.push({ createdAt: { gte: params.fromDate } });
    }

    if (params.toDate) {
      filters.push({ createdAt: { lte: params.toDate } });
    }

    if (params.cursor) {
      filters.push({
        OR:
          params.sortDirection === "asc"
            ? [
                { createdAt: { gt: params.cursor.createdAt } },
                { createdAt: params.cursor.createdAt, id: { gt: params.cursor.id } },
              ]
            : [
                { createdAt: { lt: params.cursor.createdAt } },
                { createdAt: params.cursor.createdAt, id: { lt: params.cursor.id } },
              ],
      });
    }

    const users = await this.userRepo.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: [
        { createdAt: params.sortDirection },
        { id: params.sortDirection },
      ],
      take: limit + 1,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        bannedUntil: true,
        banReason: true,
        shadowBannedAt: true,
        shadowBanReason: true,
        createdAt: true,
      },
    });

    const hasMore = users.length > limit;
    const sliced = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return { ok: true, payload: { data: sliced, nextCursor } };
  }

  async banUser(params: {
    actor: AdminUserActor;
    targetId: string;
    days: number;
    reason: string;
    request: Request;
  }): Promise<AdminUserMutateResult> {
    const { actor, targetId, days, reason, request } = params;

    const target = await this.userRepo.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (target.id === actor.id) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    if (target.role === "ADMIN" && actor.role !== "ADMIN") {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          bannedUntil,
          banReason: reason ?? null,
        },
        select: {
          id: true,
          bannedUntil: true,
          banReason: true,
          role: true,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_BAN",
        targetType: "User",
        targetId: user.id,
        metadata: {
          days,
          reason: reason ?? null,
        },
      });

      return user;
    });

    void publishDomainEvent("user.banned", {
      userId: updated.id,
      actorId: actor.id,
      bannedUntil: updated.bannedUntil,
      reason: updated.banReason ?? null,
    });

    return { ok: true, payload: { data: updated } };
  }

  async unbanUser(params: {
    actor: AdminUserActor;
    targetId: string;
    request: Request;
  }): Promise<AdminUserMutateResult> {
    const { actor, targetId, request } = params;

    const target = await this.userRepo.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (target.id === actor.id) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    if (target.role === "ADMIN" && actor.role !== "ADMIN") {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          bannedUntil: null,
          banReason: null,
        },
        select: {
          id: true,
          bannedUntil: true,
          banReason: true,
          role: true,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_UNBAN",
        targetType: "User",
        targetId: user.id,
      });

      return user;
    });

    void publishDomainEvent("user.unbanned", {
      userId: updated.id,
      actorId: actor.id,
    });

    return { ok: true, payload: { data: updated } };
  }

  async shadowBanUser(params: {
    actor: AdminUserActor;
    targetId: string;
    reason: string;
    request: Request;
  }): Promise<AdminUserMutateResult> {
    const { actor, targetId, reason, request } = params;

    const target = await this.userRepo.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (target.id === actor.id) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    if (target.role === "ADMIN" && actor.role !== "ADMIN") {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          shadowBannedAt: new Date(),
          shadowBanReason: reason,
        },
        select: {
          id: true,
          shadowBannedAt: true,
          shadowBanReason: true,
          role: true,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_SHADOWBAN",
        targetType: "User",
        targetId: user.id,
        metadata: { reason },
      });

      return user;
    });

    void publishDomainEvent("user.shadowbanned", {
      userId: updated.id,
      actorId: actor.id,
      reason: updated.shadowBanReason ?? null,
    });

    return { ok: true, payload: { data: updated } };
  }

  async shadowUnbanUser(params: {
    actor: AdminUserActor;
    targetId: string;
    request: Request;
  }): Promise<AdminUserMutateResult> {
    const { actor, targetId, request } = params;

    const target = await this.userRepo.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (target.id === actor.id) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    if (target.role === "ADMIN" && actor.role !== "ADMIN") {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          shadowBannedAt: null,
          shadowBanReason: null,
        },
        select: {
          id: true,
          shadowBannedAt: true,
          shadowBanReason: true,
          role: true,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_SHADOWUNBAN",
        targetType: "User",
        targetId: user.id,
      });

      return user;
    });

    void publishDomainEvent("user.shadowunbanned", {
      userId: updated.id,
      actorId: actor.id,
    });

    return { ok: true, payload: { data: updated } };
  }

  async changeRole(params: {
    actor: AdminUserActor;
    targetId: string;
    role: Role;
    request: Request;
  }): Promise<AdminUserMutateResult> {
    const { actor, targetId, role, request } = params;

    if (actor.id === targetId) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const target = await this.userRepo.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { role },
        select: { id: true, role: true },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "USER_ROLE_CHANGE",
        targetType: "User",
        targetId: user.id,
        metadata: { from: target.role, to: role },
      });

      return user;
    });

    void publishDomainEvent("user.role_changed", {
      userId: updated.id,
      actorId: actor.id,
      role: updated.role,
    });

    return { ok: true, payload: { data: updated } };
  }
}
