import { type Prisma } from "@prisma/client";

import { canModerate, getCommunityScope, type Role } from "@/lib/auth";
import { buildCursorString } from "@/lib/pagination";
import { ReportRepository } from "@/repositories/report-repository";

export type AdminReportActor = { id: string; role: Role };

export type AdminReportListResult =
  | { ok: true; payload: { data: unknown[]; nextCursor: string | null } }
  | { ok: false; code: "FORBIDDEN"; status: 403 };

const DEFAULT_LIMIT = 50;

export class AdminReportService {
  constructor(private readonly reportRepo = new ReportRepository()) {}

  async listReports(params: {
    actor: AdminReportActor;
    status?: string | null;
    category?: string | null;
    query?: string | null;
    sortDirection: "asc" | "desc";
    fromDate?: Date | null;
    toDate?: Date | null;
    limit?: number | null;
    cursor: { createdAt: Date; id: string } | null;
  }): Promise<AdminReportListResult> {
    const { actor } = params;
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const limit = params.limit ?? DEFAULT_LIMIT;
    const whereFilters: Prisma.ReportWhereInput[] = [];

    if (communityIds) {
      whereFilters.push({ post: { communityId: { in: communityIds } } });
    }

    if (params.status) {
      whereFilters.push({ status: params.status as Prisma.ReportWhereInput["status"] });
    }

    if (params.category) {
      whereFilters.push({ category: params.category as Prisma.ReportWhereInput["category"] });
    }

    if (params.query) {
      whereFilters.push({
        OR: [
          { reason: { contains: params.query, mode: "insensitive" } },
          { reporter: { email: { contains: params.query, mode: "insensitive" } } },
          { reporter: { username: { contains: params.query, mode: "insensitive" } } },
          { post: { content: { contains: params.query, mode: "insensitive" } } },
        ],
      });
    }

    if (params.fromDate) {
      whereFilters.push({ createdAt: { gte: params.fromDate } });
    }

    if (params.toDate) {
      whereFilters.push({ createdAt: { lte: params.toDate } });
    }

    if (params.cursor) {
      whereFilters.push({
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

    const reports = await this.reportRepo.findMany({
      where: whereFilters.length ? { AND: whereFilters } : undefined,
      orderBy: [
        { createdAt: params.sortDirection },
        { id: params.sortDirection },
      ],
      take: limit + 1,
      include: {
        post: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            author: { select: { id: true, username: true, name: true } },
          },
        },
        reporter: { select: { id: true, email: true, username: true, name: true } },
        resolvedBy: { select: { id: true, email: true, username: true, name: true } },
      },
    });

    const hasMore = reports.length > limit;
    const sliced = hasMore ? reports.slice(0, limit) : reports;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return { ok: true, payload: { data: sliced, nextCursor } };
  }
}
