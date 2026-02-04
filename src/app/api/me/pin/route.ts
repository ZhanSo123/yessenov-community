import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { PinPostSchema } from "@/lib/validators";
import { MeProfileService } from "@/services/me-profile-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = PinPostSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireOnboardedUserApi();

    const { postId } = parsed.data;

    const service = new MeProfileService();
    const result = await service.updatePinnedPost({ user, postId });

    if (!result.ok) {
      return apiError(result.code, result.status, result.message ? { message: result.message } : undefined);
    }

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
