import { performance } from "node:perf_hooks";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { parseCursor } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { ProfileContentService } from "@/services/profile-content-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  const startMs = performance.now();
  let limitLog: number | null = null;
  let cursorLog: string | null = null;
  const logDb = (query: string, ms: number) => {
    console.info("api.db", {
      route: "/api/users/[username]/posts",
      query,
      ms,
      limit: limitLog,
      cursor: cursorLog,
    });
  };
  try {
    const { username } = await context.params;
    const trimmed = username.trim();
    if (!trimmed) {
      return apiError("BAD_REQUEST", 400);
    }
    const usernameLower = trimmed.toLowerCase();

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
    limitLog = limit;
    cursorLog = pagination.data.cursor ?? null;

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const viewer = await getOptionalUser();
    const service = new ProfileContentService();
    const result = await service.listUserPosts({
      usernameLower,
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
      logDb,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  } finally {
    console.info("api.timing", {
      route: "/api/users/[username]/posts",
      ms: Math.round(performance.now() - startMs),
      limit: limitLog,
      cursor: cursorLog,
    });
  }
}
