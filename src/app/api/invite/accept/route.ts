import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { InviteAcceptService } from "@/services/invite-accept-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const inviteOnly = process.env.INVITE_ONLY === "true";

    let code: string | null = null;
    if (inviteOnly) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError("BAD_REQUEST", 400);
      }

      code = String((body as { code?: string }).code ?? "").trim();
    }
    const allowedCodes = (process.env.INVITE_CODES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const user = await requireUserApi();
    const service = new InviteAcceptService();
    const result = await service.acceptInvite({
      actor: user,
      inviteOnly,
      code,
      allowedCodes,
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
