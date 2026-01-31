import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { type NextRequest } from "next/server";

import { logError, normalizeError } from "@/lib/error-log";

type ApiMetrics = {
  startMs: number;
  dbQueryCount: number;
  route: string;
  method: string;
};

const metricsStore = new AsyncLocalStorage<ApiMetrics>();

export const getApiMetricsStore = () => metricsStore.getStore();

type ApiHandler = (
  request: NextRequest,
  context?: unknown
) => Promise<Response>;

export function withApiMetrics<T extends ApiHandler>(handler: T): T {
  return (async (request: NextRequest, context?: unknown) => {
    const startMs = performance.now();
    const route = new URL(request.url).pathname;
    const method = request.method;
    let thrownError: unknown;

    return metricsStore.run(
      { startMs, dbQueryCount: 0, route, method },
      async () => {
        let response: Response | undefined;
        try {
          response = await handler(request, context);
          return response;
        } catch (error) {
          if (error instanceof Response) {
            response = error;
            return error;
          }
          thrownError = error;
          throw error;
        } finally {
          const store = metricsStore.getStore();
          const durationMs = Math.round(performance.now() - startMs);
          const status = response?.status ?? 500;
          const dbQueryCount = store?.dbQueryCount ?? 0;

          console.info("api.metrics", {
            route,
            method,
            status,
            durationMs,
            dbQueryCount,
          });

          if (thrownError && status >= 500) {
            const { message, stack } = normalizeError(thrownError);
            const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
            const ip = forwardedFor.split(",")[0]?.trim() || null;
            void logError({
              message,
              stack,
              route,
              method,
              status,
              userAgent: request.headers.get("user-agent"),
              ip,
            });
          }
        }
      }
    );
  }) as T;
}
