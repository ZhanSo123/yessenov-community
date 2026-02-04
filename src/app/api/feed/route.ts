import { performance } from "node:perf_hooks";
import { NextRequest } from "next/server";

import { withApiMetrics } from "@/lib/api-metrics";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser, requireOnboardedUserApi } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { parseCursor } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { FeedService } from "@/services/feed-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

const handler = async (request: NextRequest) => {
  const startMs = performance.now();
  let modeLog: string | null = null;
  let limitLog: number | null = null;
  let cursorLog: string | null = null;
  const logDb = (query: string, ms: number) => {
    console.info("api.db", {
      route: "/api/feed",
      query,
      ms,
      mode: modeLog,
      limit: limitLog,
      cursor: cursorLog,
    });
  };
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") ?? "for-you";
    const interest = searchParams.get("interest")?.trim() ?? "";
    const interestTerms = interest
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    if (mode !== "for-you" && mode !== "following") {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursor(pagination.data.cursor);
    modeLog = mode;
    limitLog = limit;
    cursorLog = pagination.data.cursor ?? null;

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    let viewer = await getOptionalUser();
    if (mode === "following" && !viewer) {
      viewer = await requireOnboardedUserApi();
    }

    const service = new FeedService();
    const result = await service.getFeed({
      mode,
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
      interestTerms,
      logDb,
    });

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    try {
      const url = new URL(request.url);
      console.error("api/feed error", {
        mode: url.searchParams.get("mode"),
        cursor: url.searchParams.get("cursor"),
        limit: url.searchParams.get("limit"),
        message: error instanceof Error ? error.message : String(error),
      });
    } catch {
      console.error("api/feed error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return apiError("INTERNAL_ERROR", 500);
  } finally {
    console.info("api.timing", {
      route: "/api/feed",
      ms: Math.round(performance.now() - startMs),
      mode: modeLog,
      limit: limitLog,
      cursor: cursorLog,
    });
  }
};

export const GET = withApiMetrics(handler);
