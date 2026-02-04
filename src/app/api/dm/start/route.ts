import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { validateUsername, DmStartSchema } from "@/lib/validators";
import { DmStartService } from "@/services/dm-start-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let actorId: string | null = null;
  let targetUserId: string | null = null;
  let targetUsernameLower: string | null = null;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400, { message: "INVALID_INPUT" });
    }

    const parsed = DmStartSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, { message: "INVALID_INPUT" });
    }

    const usernameResult = validateUsername(parsed.data.username);
    if (!usernameResult.ok) {
      return apiError("BAD_REQUEST", 400, { message: "INVALID_INPUT" });
    }
    targetUsernameLower = usernameResult.usernameLower;

    const me = await requireOnboardedUserApi();
    actorId = me.id;
    const service = new DmStartService();
    const result = await service.startConversation({
      actorId: me.id,
      targetUsernameLower: usernameResult.usernameLower,
    });

    if (!result.ok) {
      return apiError(result.code, result.status, result.meta);
    }

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error("dm.start.failed", {
      requestId,
      userId: actorId,
      targetUserId,
      targetUsernameLower,
      error:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : { message: String(error) },
    });

    return apiError("INTERNAL_ERROR", 500);
  }
}
