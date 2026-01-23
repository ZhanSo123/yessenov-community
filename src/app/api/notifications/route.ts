import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { buildCursorString, parseCursorString } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
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

    const user = await requireUserApi();

    const cursorFilter = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        ...cursorFilter,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
        post: { select: { id: true } },
      },
    });

    const hasMore = notifications.length > limit;
    const sliced = hasMore ? notifications.slice(0, limit) : notifications;
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
