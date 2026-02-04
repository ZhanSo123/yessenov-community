import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, requireUserApi } from "@/lib/auth";
import { rateLimitModeration } from "@/lib/rate-limit";
import { BulkActionSchema } from "@/lib/validators";
import { AdminBulkService } from "@/services/admin-bulk-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireUserApi();

    if (!(await rateLimitModeration(request, actor.id))) {
      return apiError("RATE_LIMIT", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = BulkActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const { action, ids, reason, days, note } = parsed.data;

    if (ids.length === 0 || ids.length > MAX_BULK) {
      return apiError("BAD_REQUEST", 400);
    }

    const destructiveActions = new Set(["POST_DELETE", "USER_BAN"]);
    if (destructiveActions.has(action) && !reason) {
      return apiError("BAD_REQUEST", 400);
    }

    if (!canModerate(actor) && (action === "USER_BAN" || action === "USER_UNBAN")) {
      return apiError("FORBIDDEN", 403);
    }

    const service = new AdminBulkService();
    const result = await service.executeBulk({
      actor: { id: actor.id, role: actor.role },
      action,
      ids,
      reason: reason ?? null,
      days: days ?? null,
      note: note ?? null,
      request,
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
