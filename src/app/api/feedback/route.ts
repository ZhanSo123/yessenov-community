import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { FeedbackCreateSchema } from "@/lib/validators";
import { FeedbackService } from "@/services/feedback-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = FeedbackCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();

    const service = new FeedbackService();
    const result = await service.createFeedback({
      userId: user.id,
      message: parsed.data.message,
      currentPath: parsed.data.currentPath ?? null,
    });

    return apiSuccess(result.payload, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
