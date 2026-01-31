import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCursor, parseCursor } from "@/lib/pagination";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "open";
    const query = searchParams.get("query")?.trim() ?? "";
    const cursor = parseCursor(searchParams.get("cursor"));
    const limitRaw = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(5, Math.min(100, limitRaw))
      : DEFAULT_LIMIT;

    if (searchParams.get("cursor") && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const where = {
      resolvedAt: status === "resolved" ? { not: null } : null,
      ...(query
        ? {
            OR: [
              { message: { contains: query, mode: "insensitive" as const } },
              { route: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const andFilters = [];
    if (cursor) {
      andFilters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const logs = await prisma.errorLog.findMany({
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
      ? buildCursor(
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
