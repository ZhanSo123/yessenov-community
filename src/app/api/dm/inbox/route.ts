import { performance } from "node:perf_hooks";
import { NextRequest } from "next/server";

import { withApiMetrics } from "@/lib/api-metrics";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { PaginationSchema } from "@/lib/validators";
import { DmInboxService } from "@/services/dm-inbox-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

const handler = async (request: NextRequest) => {
  const startMs = performance.now();
  let limitLog: number | null = null;
  let cursorLog: string | null = null;
  const logDb = (query: string, ms: number) => {
    console.info("api.db", {
      route: "/api/dm/inbox",
      query,
      ms,
      limit: limitLog,
      cursor: cursorLog,
    });
  };
  try {
    const me = await requireOnboardedUserApi();
    const { searchParams } = new URL(request.url);

    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    limitLog = limit;
    cursorLog = pagination.data.cursor ?? null;
    const service = new DmInboxService();
    const result = await service.getInbox({
      viewer: { id: me.id, role: me.role },
      limit,
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
      route: "/api/dm/inbox",
      ms: Math.round(performance.now() - startMs),
      limit: limitLog,
      cursor: cursorLog,
    });
  }
};

export const GET = withApiMetrics(handler);
