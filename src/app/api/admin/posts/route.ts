import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { parseCursor } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { AdminPostService } from "@/services/admin-post-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUserApi();

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim();
    const deletedParam = searchParams.get("deleted");
    const communitySlug = searchParams.get("community")?.trim();
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
    const cursor = parseCursor(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const fromDate = fromParam ? new Date(fromParam) : null;
    if (fromParam && Number.isNaN(fromDate?.getTime() ?? NaN)) {
      return apiError("BAD_REQUEST", 400);
    }

    const toDate = toParam ? new Date(toParam) : null;
    if (toParam && Number.isNaN(toDate?.getTime() ?? NaN)) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new AdminPostService();
    const result = await service.listPosts({
      actor: { id: actor.id, role: actor.role },
      query: query ?? null,
      deleted: deletedParam === "1" || deletedParam === "0" ? deletedParam : null,
      communitySlug: communitySlug ?? null,
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
