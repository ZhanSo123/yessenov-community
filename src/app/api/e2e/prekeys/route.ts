import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { E2ePreKeysSchema } from "@/lib/validators";
import { E2ePreKeyService } from "@/services/e2e-prekey-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const me = await requireOnboardedUserApi();
    const allowed = await rateLimit(request, `e2e:${me.id}:prekeys`);
    if (!allowed) {
      return apiError("TOO_MANY_REQUESTS", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = E2ePreKeysSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const expiresAt = parsed.data.signedPreKey.expiresAt
      ? new Date(parsed.data.signedPreKey.expiresAt)
      : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new E2ePreKeyService();
    const result = await service.uploadPreKeys({
      userId: me.id,
      deviceId: parsed.data.deviceId,
      signedPreKey: {
        keyId: parsed.data.signedPreKey.keyId,
        publicKey: parsed.data.signedPreKey.publicKey,
        signature: parsed.data.signedPreKey.signature,
        expiresAt,
      },
      oneTimePreKeys: parsed.data.oneTimePreKeys ?? [],
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
