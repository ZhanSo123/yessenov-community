import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { parseCursorString } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { AdminAuditService } from "@/services/admin-audit-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType")?.trim() || null;
    const query = searchParams.get("query")?.trim();
    const sortParam = searchParams.get("sort") ?? "desc";
    const sortDirection = sortParam === "asc" ? "asc" : "desc";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursorString(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    let fromDate: Date | null = null;
    if (fromParam) {
      fromDate = new Date(fromParam);
      if (Number.isNaN(fromDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
    }

    let toDate: Date | null = null;
    if (toParam) {
      toDate = new Date(toParam);
      if (Number.isNaN(toDate.getTime())) {
        return apiError("BAD_REQUEST", 400);
      }
    }

    const service = new AdminAuditService();
    const result = await service.listLogs({
      targetType,
      query,
      sortDirection,
      fromDate,
      toDate,
      limit,
      cursor,
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
