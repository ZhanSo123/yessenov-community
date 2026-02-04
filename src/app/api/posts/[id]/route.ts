import { performance } from "node:perf_hooks";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser, requireOnboardedUserApi } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { parseCursor } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { PostService } from "@/services/post-service";
import { ThreadService } from "@/services/thread-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startMs = performance.now();
  let limitLog: number | null = null;
  let cursorLog: string | null = null;
  const logDb = (query: string, ms: number) => {
    console.info("api.db", {
      route: "/api/posts/[id]",
      query,
      ms,
      limit: limitLog,
      cursor: cursorLog,
    });
  };
  try {
    const { id } = await context.params;
    const postId = Number(id);
    if (Number.isNaN(postId)) {
      return apiError("BAD_REQUEST", 400);
    }

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
    const service = new ThreadService();
    const result = await service.getThread({
      postId,
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
      return apiError(result.code, result.status, result.meta);
    }

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  } finally {
    console.info("api.timing", {
      route: "/api/posts/[id]",
      ms: Math.round(performance.now() - startMs),
      limit: limitLog,
      cursor: cursorLog,
    });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const postId = Number(id);
    if (Number.isNaN(postId)) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();
    const service = new PostService();
    const result = await service.deletePost(postId, { id: user.id });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
