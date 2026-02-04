import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, type Role } from "@/lib/auth";
import { getInfrastructure } from "@/infrastructure";
import { prisma } from "@/lib/prisma";
import { CommunityMemberRepository } from "@/repositories/community-member-repository";
import { CommunityRepository } from "@/repositories/community-repository";
import { UserRepository } from "@/repositories/user-repository";

export type AdminCommunityModsActor = { id: string; role: Role };

export type AdminCommunityModsResult =
  | { ok: true; payload: { data: unknown; community: unknown } }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST"; status: 404 | 403 | 400 };

export type AdminCommunityModsMutationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST"; status: 404 | 403 | 400 };

export class AdminCommunityModsService {
  constructor(
    private readonly communityRepo = new CommunityRepository(),
    private readonly communityMemberRepo = new CommunityMemberRepository(),
    private readonly userRepo = new UserRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async listMembers(params: {
    actor: AdminCommunityModsActor;
    slug: string;
  }): Promise<AdminCommunityModsResult> {
    const { actor, slug } = params;

    const community = await this.communityRepo.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });

    if (!community) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (!canModerate(actor)) {
      const role = await getCommunityModeratorRole(community.id, actor.id);
      if (!role) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
    }

    const members = await this.communityMemberRepo.findMany({
      where: { communityId: community.id },
      include: {
        user: {
          select: { id: true, email: true, username: true, name: true, role: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return { ok: true, payload: { data: members, community } };
  }

  async upsertMember(params: {
    actor: AdminCommunityModsActor;
    slug: string;
    userId?: string;
    email?: string;
    username?: string;
    role?: "MEMBER" | "MOD" | "OWNER";
    request: Request;
  }): Promise<AdminCommunityModsMutationResult> {
    const { actor, slug, request } = params;

    const community = await this.communityRepo.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });

    if (!community) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const desiredRole = params.role ?? "MEMBER";

    if (!canModerate(actor)) {
      const role = await getCommunityModeratorRole(community.id, actor.id);
      if (!role) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
      if (role === "MOD" && desiredRole !== "MEMBER") {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
      if (desiredRole === "OWNER") {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
    }

    let targetUser = null;
    if (params.userId) {
      targetUser = await this.userRepo.findUnique({
        where: { id: params.userId },
        select: { id: true, email: true, username: true },
      });
    } else if (params.email) {
      targetUser = await this.userRepo.findUnique({
        where: { email: params.email },
        select: { id: true, email: true, username: true },
      });
    } else if (params.username) {
      targetUser = await this.userRepo.findFirst({
        where: { usernameLower: params.username.toLowerCase() },
        select: { id: true, email: true, username: true },
      });
    }

    if (!targetUser) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const member = await prisma.$transaction(async (tx) => {
      const updated = await tx.communityMember.upsert({
        where: {
          communityId_userId: {
            communityId: community.id,
            userId: targetUser.id,
          },
        },
        update: { role: desiredRole },
        create: {
          communityId: community.id,
          userId: targetUser.id,
          role: desiredRole,
        },
        include: {
          user: {
            select: { id: true, email: true, username: true, name: true, role: true },
          },
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "COMMUNITY_MOD_UPSERT",
        targetType: "CommunityMember",
        targetId: updated.id,
        metadata: {
          communityId: community.id,
          userId: targetUser.id,
          role: desiredRole,
        },
      });

      return updated;
    });

    await this.cache.del(`community-access:${targetUser.id}:`);

    return { ok: true, payload: { data: member } };
  }

  async removeMember(params: {
    actor: AdminCommunityModsActor;
    slug: string;
    userId: string;
    request: Request;
  }): Promise<AdminCommunityModsMutationResult> {
    const { actor, slug, userId, request } = params;

    const community = await this.communityRepo.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });

    if (!community) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (!canModerate(actor)) {
      const role = await getCommunityModeratorRole(community.id, actor.id);
      if (role !== "OWNER") {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
    }

    const target = await this.communityMemberRepo.findUnique({
      where: {
        communityId_userId: { communityId: community.id, userId },
      },
      select: { id: true, role: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (!canModerate(actor) && target.role === "OWNER") {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    await prisma.$transaction(async (tx) => {
      await tx.communityMember.delete({
        where: {
          communityId_userId: { communityId: community.id, userId },
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "COMMUNITY_MOD_REMOVE",
        targetType: "CommunityMember",
        targetId: target.id,
        metadata: {
          communityId: community.id,
          userId,
        },
      });
    });

    await this.cache.del(`community-access:${userId}:`);

    return { ok: true, payload: { ok: true } };
  }
}
