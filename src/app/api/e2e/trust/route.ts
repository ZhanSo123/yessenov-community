import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { E2eTrustSchema } from "@/lib/validators";
import { E2eTrustService } from "@/services/e2e-trust-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const me = await requireOnboardedUserApi();
    const allowed = await rateLimit(request, `e2e:${me.id}:trust:read`);
    if (!allowed) {
      return apiError("TOO_MANY_REQUESTS", 429);
    }
    const { searchParams } = new URL(request.url);
    const peerDeviceId = searchParams.get("peerDeviceId")?.trim() ?? "";
    const peerIdentityKey = searchParams.get("peerIdentityKey")?.trim() ?? "";
    if (!peerDeviceId || !peerIdentityKey) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new E2eTrustService();
    const result = await service.getStatus({
      userId: me.id,
      peerDeviceId,
      peerIdentityKey,
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

export async function POST(request: NextRequest) {
  try {
    const me = await requireOnboardedUserApi();
    const allowed = await rateLimit(request, `e2e:${me.id}:trust:write`);
    if (!allowed) {
      return apiError("TOO_MANY_REQUESTS", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = E2eTrustSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new E2eTrustService();
    const result = await service.markTrusted({
      userId: me.id,
      peerDeviceId: parsed.data.peerDeviceId,
      peerIdentityKey: parsed.data.peerIdentityKey,
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
