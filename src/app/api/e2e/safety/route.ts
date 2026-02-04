import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { E2eSafetyService } from "@/services/e2e-safety-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const me = await requireOnboardedUserApi();
    const allowed = await rateLimit(request, `e2e:${me.id}:safety`);
    if (!allowed) {
      return apiError("TOO_MANY_REQUESTS", 429);
    }
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId")?.trim() ?? "";
    const peerDeviceId = searchParams.get("peerDeviceId")?.trim() ?? "";
    if (!deviceId || !peerDeviceId) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new E2eSafetyService();
    const result = await service.getSafety({
      userId: me.id,
      deviceId,
      peerDeviceId,
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
