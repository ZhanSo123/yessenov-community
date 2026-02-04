import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { parseCursorString } from "@/lib/pagination";
import { AdminErrorService } from "@/services/admin-error-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "open";
    const query = searchParams.get("query")?.trim() ?? "";
    const cursor = parseCursorString(searchParams.get("cursor"));
    const limitRaw = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(5, Math.min(100, limitRaw))
      : DEFAULT_LIMIT;

    if (searchParams.get("cursor") && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new AdminErrorService();
    const result = await service.listErrors({
      status: status === "resolved" ? "resolved" : "open",
      query,
      cursor,
      limit,
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
