import { type Prisma } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getCommunityScope, requireUserApi } from "@/lib/auth";
import { buildCursorString, parseCursorString } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  PaginationSchema,
  ReportCategorySchema,
  ReportStatusSchema,
} from "@/lib/validators";

const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return apiError("FORBIDDEN", 403);
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const categoryParam = searchParams.get("category");
    const query = searchParams.get("query")?.trim();
    const sortParam = searchParams.get("sort") ?? "desc";
    const sortDirection = sortParam === "asc" ? "asc" : "desc";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const status = statusParam
      ? ReportStatusSchema.safeParse(statusParam)
      : null;

    if (statusParam && !status?.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const category = categoryParam
      ? ReportCategorySchema.safeParse(categoryParam)
      : null;

    if (categoryParam && !category?.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursorString(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const whereFilters: Prisma.ReportWhereInput[] = [];

    if (communityIds) {
      whereFilters.push({
        post: { communityId: { in: communityIds } },
      });
    }

    if (status?.success) {
      whereFilters.push({ status: status.data });
    }

    if (category?.success) {
      whereFilters.push({ category: category.data });
    }

    if (query) {
      whereFilters.push({
        OR: [
          { reason: { contains: query, mode: "insensitive" } },
          { reporter: { email: { contains: query, mode: "insensitive" } } },
          { reporter: { username: { contains: query, mode: "insensitive" } } },
          { post: { content: { contains: query, mode: "insensitive" } } },
        ],
      });
    }

    if (fromParam) {
      const fromDate = new Date(fromParam);
      if (Number.isNaN(fromDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      whereFilters.push({ createdAt: { gte: fromDate } });
    }

    if (toParam) {
      const toDate = new Date(toParam);
      if (Number.isNaN(toDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      whereFilters.push({ createdAt: { lte: toDate } });
    }

    if (cursor) {
      whereFilters.push({
        OR:
          sortDirection === "asc"
            ? [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ]
            : [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
      });
    }

    const reports = await prisma.report.findMany({
      where: whereFilters.length ? { AND: whereFilters } : undefined,
      orderBy: [
        { createdAt: sortDirection },
        { id: sortDirection },
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

    return apiSuccess({ data: sliced, nextCursor });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
