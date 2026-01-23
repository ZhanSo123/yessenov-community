import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { buildCursorString, parseCursorString } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("MOD");

    const { searchParams } = new URL(request.url);
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

    const filters: Prisma.UserWhereInput[] = [];

    if (query) {
      filters.push({
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { username: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
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

    const users = await prisma.user.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: [
        { createdAt: sortDirection },
        { id: sortDirection },
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

    return apiSuccess({ data: sliced, nextCursor });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
