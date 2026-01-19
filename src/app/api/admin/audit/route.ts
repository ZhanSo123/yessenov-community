import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { buildCursorString, parseCursorString } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

const DEFAULT_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType")?.trim() || null;
    const query = searchParams.get("query")?.trim();
    const sortParam = searchParams.get("sort") ?? "desc";
    const sortDirection = sortParam === "asc" ? "asc" : "desc";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

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

    const filters: Prisma.AuditLogWhereInput[] = [];

    if (targetType) {
      filters.push({ targetType });
    }

    if (query) {
      filters.push({
        OR: [
          { action: { contains: query, mode: "insensitive" } },
          { actor: { email: { contains: query, mode: "insensitive" } } },
          { actor: { username: { contains: query, mode: "insensitive" } } },
        ],
      });
    }

    if (fromParam) {
      const fromDate = new Date(fromParam);
      if (Number.isNaN(fromDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      filters.push({ createdAt: { gte: fromDate } });
    }

    if (toParam) {
      const toDate = new Date(toParam);
      if (Number.isNaN(toDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
      filters.push({ createdAt: { lte: toDate } });
    }

    if (cursor) {
      filters.push({
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

    const logs = await prisma.auditLog.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: [
        { createdAt: sortDirection },
        { id: sortDirection },
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

    return apiSuccess({ data: sliced, nextCursor });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
