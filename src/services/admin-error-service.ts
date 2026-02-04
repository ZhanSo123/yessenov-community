import { type Prisma } from "@prisma/client";

import { buildCursorString } from "@/lib/pagination";
import { ErrorLogRepository } from "@/repositories/error-log-repository";

export type AdminErrorListResult =
  | { ok: true; payload: { data: unknown[]; nextCursor: string | null } }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

export type AdminErrorResolveResult =
  | { ok: true; payload: { data: unknown } }
  | { ok: false; code: "NOT_FOUND"; status: 404 };

const DEFAULT_LIMIT = 30;

export class AdminErrorService {
  constructor(private readonly errorRepo = new ErrorLogRepository()) {}

  async listErrors(params: {
    status: "open" | "resolved";
    query?: string | null;
    cursor: { createdAt: Date; id: string } | null;
    limit?: number | null;
  }): Promise<AdminErrorListResult> {
    const limit = params.limit ?? DEFAULT_LIMIT;

    const where: Prisma.ErrorLogWhereInput = {
      resolvedAt: params.status === "resolved" ? { not: null } : null,
      ...(params.query
        ? {
            OR: [
              { message: { contains: params.query, mode: "insensitive" as const } },
              { route: { contains: params.query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const andFilters: Prisma.ErrorLogWhereInput[] = [];
    if (params.cursor) {
      andFilters.push({
        OR: [
          { createdAt: { lt: params.cursor.createdAt } },
          { createdAt: params.cursor.createdAt, id: { lt: params.cursor.id } },
        ],
      });
    }

    const logs = await this.errorRepo.findMany({
      where: andFilters.length > 0 ? { ...where, AND: andFilters } : where,
      orderBy: [
        { createdAt: "desc" as const },
        { id: "desc" as const },
      ],
      take: limit + 1,
      select: {
        id: true,
        level: true,
        message: true,
        route: true,
        method: true,
        status: true,
        userId: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        resolvedAt: true,
        metadata: true,
      },
    });

    const hasMore = logs.length > limit;
    const sliced = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return { ok: true, payload: { data: sliced, nextCursor } };
  }

  async resolveError(params: {
    errorId: string;
    actorId: string;
  }): Promise<AdminErrorResolveResult> {
    const target = await this.errorRepo.findUnique({
      where: { id: params.errorId },
      select: { id: true },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const updated = await this.errorRepo.update({
      where: { id: params.errorId },
      data: { resolvedAt: new Date(), resolvedById: params.actorId },
      select: {
        id: true,
        resolvedAt: true,
        resolvedById: true,
      },
    });

    return { ok: true, payload: { data: updated } };
  }
}
