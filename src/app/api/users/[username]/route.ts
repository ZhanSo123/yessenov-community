import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { ProfileHeaderService } from "@/services/profile-header-service";

export const runtime = "nodejs";

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

    const viewer = await getOptionalUser();
    const service = new ProfileHeaderService();
    const result = await service.getProfileHeader({
      usernameLower,
      viewer: viewer ? { id: viewer.id, role: viewer.role } : null,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
