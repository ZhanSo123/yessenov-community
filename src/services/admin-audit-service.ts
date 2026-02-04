import { type Prisma } from "@prisma/client";

import { buildCursorString } from "@/lib/pagination";
import { AuditLogRepository } from "@/repositories/audit-log-repository";

export type AdminAuditListResult =
  | { ok: true; payload: { data: unknown[]; nextCursor: string | null } }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

const DEFAULT_LIMIT = 100;

export class AdminAuditService {
  constructor(private readonly auditRepo = new AuditLogRepository()) {}

  async listLogs(params: {
    targetType?: string | null;
    query?: string | null;
    sortDirection: "asc" | "desc";
    fromDate?: Date | null;
    toDate?: Date | null;
    limit?: number | null;
    cursor: { createdAt: Date; id: string } | null;
  }): Promise<AdminAuditListResult> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const filters: Prisma.AuditLogWhereInput[] = [];

    if (params.targetType) {
      filters.push({ targetType: params.targetType });
    }

    if (params.query) {
      filters.push({
        OR: [
          { action: { contains: params.query, mode: "insensitive" } },
          { actor: { email: { contains: params.query, mode: "insensitive" } } },
          { actor: { username: { contains: params.query, mode: "insensitive" } } },
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

    const logs = await this.auditRepo.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: [
        { createdAt: params.sortDirection },
        { id: params.sortDirection },
      ],
      take: limit + 1,
      include: {
        actor: { select: { id: true, email: true, username: true, name: true } },
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
}
