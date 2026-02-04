import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { CommunityMemberSchema } from "@/lib/validators";
import { AdminCommunityModsService } from "@/services/admin-community-mods-service";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const actor = await requireUserApi();
    const service = new AdminCommunityModsService();
    const result = await service.listMembers({ actor, slug });

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = CommunityMemberSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const actor = await requireUserApi();
    const service = new AdminCommunityModsService();
    const result = await service.upsertMember({
      actor,
      slug,
      userId: parsed.data.userId,
      email: parsed.data.email,
      username: parsed.data.username,
      role: parsed.data.role,
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return apiError("BAD_REQUEST", 400);
    }

    const actor = await requireUserApi();
    const service = new AdminCommunityModsService();
    const result = await service.removeMember({
      actor,
      slug,
      userId,
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
