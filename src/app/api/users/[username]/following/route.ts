import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { parseCursor } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { FollowListService } from "@/services/follow-list-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;
    const trimmed = username.trim();
    if (!trimmed) {
      return apiError("BAD_REQUEST", 400);
    }
    const usernameLower = trimmed.toLowerCase();

    const pagination = PaginationSchema.safeParse({
      limit: _request.nextUrl.searchParams.get("limit") ?? undefined,
      cursor: _request.nextUrl.searchParams.get("cursor") ?? undefined,
    });
    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursor(pagination.data.cursor);
    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const viewer = await getOptionalUser();
    const service = new FollowListService();
    const result = await service.listFollowing({
      usernameLower,
      limit,
      cursor,
      viewer: viewer ? { id: viewer.id } : null,
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
