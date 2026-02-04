import { NextRequest } from "next/server";

import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { getClientIp } from "@/lib/rate-limit";
import { SearchUsersSchema } from "@/lib/validators";
import { UserSearchService } from "@/services/user-search-service";

export const runtime = "nodejs";

const SEARCH_RATE_WINDOW_MS = 10_000;
const SEARCH_RATE_MAX = 10;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = SearchUsersSchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;

    const activity = checkActivityLimit(
      viewerId ? `search:${viewerId}` : `search:${getClientIp(request)}`,
      SEARCH_RATE_WINDOW_MS,
      SEARCH_RATE_MAX
    );
    if (!activity.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const service = new UserSearchService();
    const result = await service.searchUsers({
      query: parsed.data.q,
      limit: parsed.data.limit ?? null,
      cursor: parsed.data.cursor ?? null,
      viewerId,
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
