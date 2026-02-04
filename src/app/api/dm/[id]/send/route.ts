import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { DmSendSchema } from "@/lib/validators";
import { DmSendService } from "@/services/dm-send-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireOnboardedUserApi();
    const { id } = await context.params;
    if (!id) {
      return apiError("BAD_REQUEST", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = DmSendSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new DmSendService();
    const result = await service.sendMessage({
      conversationId: id,
      senderId: me.id,
      content: parsed.data.content ?? null,
      e2eCiphertext: parsed.data.e2e?.ciphertext ?? null,
      e2eTtlSeconds: parsed.data.e2e?.ttlSeconds ?? null,
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
