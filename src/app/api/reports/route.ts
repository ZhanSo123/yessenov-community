import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { ensureNotBanned, requireOnboardedUserApi } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { ReportCreateSchema } from "@/lib/validators";
import { ReportService } from "@/services/report-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = ReportCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();
    ensureNotBanned(user);

    if (!(await rateLimit(request, user.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    const service = new ReportService();
    const result = await service.createReport({
      actor: user,
      postId: parsed.data.postId,
      reason: parsed.data.reason,
      category: parsed.data.category ?? null,
      severity: parsed.data.severity ?? null,
      request,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
