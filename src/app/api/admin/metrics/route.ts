import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { AdminRangeMetricsService } from "@/services/admin-range-metrics-service";

export const runtime = "nodejs";

const parseRange = (value: string | null) => {
  if (value === "24h") {
    return 24 * 60 * 60 * 1000;
  }
  if (value === "7d") {
    return 7 * 24 * 60 * 60 * 1000;
  }
  return null;
};

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams.get("range"));
    if (!range) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new AdminRangeMetricsService();
    const metrics = await service.getMetrics(range);

    return apiSuccess({
      data: {
        range: searchParams.get("range"),
        ...metrics,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
