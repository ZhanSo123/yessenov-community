import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { parseCursorString } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { NotificationService } from "@/services/notification-service";

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

    const user = await requireOnboardedUserApi();
    const service = new NotificationService();
    const result = await service.listNotifications({
      userId: user.id,
      limit,
      cursor,
    });

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
