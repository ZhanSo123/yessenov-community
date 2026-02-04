import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser, requireRoleApi } from "@/lib/auth";
import { buildCacheHeaders } from "@/lib/cache";
import { CommunityCreateSchema } from "@/lib/validators";
import { CommunityService } from "@/services/community-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "accessible";
    const viewer = await getOptionalUser();
    const service = new CommunityService();
    const result = await service.listCommunities({
      scope,
      viewer: viewer
        ? {
            id: viewer.id,
            role: viewer.role,
            faculty: viewer.faculty ?? null,
            course: viewer.course ?? null,
            interests: viewer.interests ?? null,
          }
        : null,
    });

    if (!result.cacheKey) {
      return apiSuccess(result.payload);
    }

    return apiSuccess(result.payload, {
      headers: buildCacheHeaders(result.cacheKey, result.cached),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRoleApi("ADMIN");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = CommunityCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new CommunityService();
    const result = await service.createCommunity({
      adminId: admin.id,
      data: parsed.data,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, { status: 201 });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
