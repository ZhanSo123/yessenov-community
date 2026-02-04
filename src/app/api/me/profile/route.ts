import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireInvitedUserApi } from "@/lib/auth";
import { validateProfile } from "@/lib/validators";
import { MeProfileService } from "@/services/me-profile-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireInvitedUserApi();

    const service = new MeProfileService();
    const result = service.getProfile(user);
    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireInvitedUserApi();

    const validated = validateProfile(body);
    if (!validated.ok) {
      return apiError("BAD_REQUEST", 400, { message: validated.error.code });
    }

    const service = new MeProfileService();
    const result = await service.updateProfile({
      user,
      data: validated.data,
    });

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
