import { NextRequest } from "next/server";

import { withApiMetrics } from "@/lib/api-metrics";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { parseCursor } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { CommunityFeedService } from "@/services/community-feed-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

const handler = async (request: NextRequest) => {
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
    const cursor = parseCursor(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const viewer = await getOptionalUser();
    const service = new CommunityFeedService();
    const result = await service.getFeed({
      viewer: viewer
        ? {
            id: viewer.id,
            role: viewer.role,
            faculty: viewer.faculty ?? null,
            course: viewer.course ?? null,
          }
        : null,
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
};

export const GET = withApiMetrics(handler);
