import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { E2eBundleService } from "@/services/e2e-bundle-service";
import { E2eTrustService } from "@/services/e2e-trust-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const me = await requireOnboardedUserApi();
    const allowed = await rateLimit(request, `e2e:${me.id}:bundle`);
    if (!allowed) {
      return apiError("TOO_MANY_REQUESTS", 429);
    }
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId")?.trim() ?? "";
    const userId = searchParams.get("userId")?.trim() ?? "";
    const username = searchParams.get("username")?.trim() ?? "";

    if (!deviceId || (!userId && !username)) {
      return apiError("BAD_REQUEST", 400);
    }

    let resolvedUserId = userId;
    if (!resolvedUserId && username) {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!user) {
        return apiError("NOT_FOUND", 404);
      }
      resolvedUserId = user.id;
    }

    const service = new E2eBundleService();
    const result = await service.getBundle({
      userId: resolvedUserId,
      deviceId,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    const trustService = new E2eTrustService();
    const trust = await trustService.getStatus({
      userId: me.id,
      peerDeviceId: result.payload.data.deviceId,
      peerIdentityKey: result.payload.data.identityKey,
    });

    return apiSuccess({
      data: {
        ...result.payload.data,
        trust: trust.ok ? trust.payload.data : null,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
