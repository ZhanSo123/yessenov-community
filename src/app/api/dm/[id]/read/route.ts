import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { DmReadService } from "@/services/dm-read-service";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireOnboardedUserApi();
    const { id } = await context.params;
    if (!id) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new DmReadService();
    const result = await service.markRead({
      conversationId: id,
      userId: me.id,
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
