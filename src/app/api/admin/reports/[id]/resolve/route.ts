import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { rateLimitModeration } from "@/lib/rate-limit";
import { ReportResolveSchema } from "@/lib/validators";
import { AdminReportResolveService } from "@/services/admin-report-resolve-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = await requireUserApi();

    if (!(await rateLimitModeration(request, actor.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = ReportResolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const { status, note } = parsed.data;
    const service = new AdminReportResolveService();
    const result = await service.resolveReport({
      actor,
      reportId: id,
      status,
      note: note ?? null,
      request,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
