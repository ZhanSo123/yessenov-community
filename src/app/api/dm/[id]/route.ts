import { performance } from "node:perf_hooks";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { parseCursorString } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { DmThreadService } from "@/services/dm-thread-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startMs = performance.now();
  let limitLog: number | null = null;
  let cursorLog: string | null = null;
  const logDb = (query: string, ms: number) => {
    console.info("api.db", {
      route: "/api/dm/thread",
      query,
      ms,
      limit: limitLog,
      cursor: cursorLog,
    });
  };
  try {
    const me = await requireOnboardedUserApi();
    const { id } = await context.params;
    if (!id) {
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
    const cursor = parseCursorString(pagination.data.cursor);
    limitLog = limit;
    cursorLog = pagination.data.cursor ?? null;
    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }
    const service = new DmThreadService();
    const result = await service.getThread({
      conversationId: id,
      viewer: { id: me.id, role: me.role },
      limit,
      cursor,
      cursorToken: pagination.data.cursor ?? null,
      logDb,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  } finally {
    console.info("api.timing", {
      route: "/api/dm/thread",
      ms: Math.round(performance.now() - startMs),
      limit: limitLog,
      cursor: cursorLog,
    });
  }
}
