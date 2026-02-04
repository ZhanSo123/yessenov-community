import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireInvitedUserApi } from "@/lib/auth";
import { OnboardingSchema } from "@/lib/validators";
import { OnboardingService } from "@/services/onboarding-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = OnboardingSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireInvitedUserApi();
    const username = parsed.data.username.trim().replace(/^@/, "").toLowerCase();
    if (!username) {
      return apiError("BAD_REQUEST", 400);
    }
    const faculty = parsed.data.faculty?.trim() ?? "";
    const bio = parsed.data.bio?.trim() ?? "";
    const image = parsed.data.image?.trim() ?? "";
    if (image && !image.startsWith("data:image/")) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new OnboardingService();
    const result = await service.completeOnboarding({
      actor: user,
      username,
      faculty: parsed.data.faculty !== undefined ? faculty || null : undefined,
      course: parsed.data.course !== undefined ? parsed.data.course ?? null : undefined,
      bio: parsed.data.bio !== undefined ? bio || null : undefined,
      image: parsed.data.image !== undefined ? image || null : undefined,
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
