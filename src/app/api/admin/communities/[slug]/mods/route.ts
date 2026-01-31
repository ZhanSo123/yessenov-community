import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CommunityMemberSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const actor = await requireUserApi();
    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });

    if (!community) {
      return apiError("NOT_FOUND", 404);
    }

    if (!canModerate(actor)) {
      const role = await getCommunityModeratorRole(community.id, actor.id);
      if (!role) {
        return apiError("FORBIDDEN", 403);
      }
    }

    const members = await prisma.communityMember.findMany({
      where: { communityId: community.id },
      include: {
        user: {
          select: { id: true, email: true, username: true, name: true, role: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return apiSuccess({ data: members, community });
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
    const actor = await requireUserApi();
    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });

    if (!community) {
      return apiError("NOT_FOUND", 404);
    }

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

    const desiredRole = parsed.data.role ?? "MEMBER";

    if (!canModerate(actor)) {
      const role = await getCommunityModeratorRole(community.id, actor.id);
      if (!role) {
        return apiError("FORBIDDEN", 403);
      }
      if (role === "MOD" && desiredRole !== "MEMBER") {
        return apiError("FORBIDDEN", 403);
      }
      if (desiredRole === "OWNER") {
        return apiError("FORBIDDEN", 403);
      }
    }

    let targetUser = null;
    if (parsed.data.userId) {
      targetUser = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: { id: true, email: true, username: true },
      });
    } else if (parsed.data.email) {
      targetUser = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        select: { id: true, email: true, username: true },
      });
    } else if (parsed.data.username) {
      targetUser = await prisma.user.findFirst({
        where: { usernameLower: parsed.data.username.toLowerCase() },
        select: { id: true, email: true, username: true },
      });
    }

    if (!targetUser) {
      return apiError("NOT_FOUND", 404);
    }

    const member = await prisma.$transaction(async (tx) => {
      const updated = await tx.communityMember.upsert({
        where: {
          communityId_userId: {
            communityId: community.id,
            userId: targetUser.id,
          },
        },
        update: { role: desiredRole },
        create: {
          communityId: community.id,
          userId: targetUser.id,
          role: desiredRole,
        },
        include: {
          user: {
            select: { id: true, email: true, username: true, name: true, role: true },
          },
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "COMMUNITY_MOD_UPSERT",
        targetType: "CommunityMember",
        targetId: updated.id,
        metadata: {
          communityId: community.id,
          userId: targetUser.id,
          role: desiredRole,
        },
      });

      return updated;
    });

    return apiSuccess({ data: member });
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
    const actor = await requireUserApi();
    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });

    if (!community) {
      return apiError("NOT_FOUND", 404);
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return apiError("BAD_REQUEST", 400);
    }

    if (!canModerate(actor)) {
      const role = await getCommunityModeratorRole(community.id, actor.id);
      if (role !== "OWNER") {
        return apiError("FORBIDDEN", 403);
      }
    }

    const target = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId: community.id, userId },
      },
      select: { id: true, role: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    if (!canModerate(actor) && target.role === "OWNER") {
      return apiError("FORBIDDEN", 403);
    }

    await prisma.$transaction(async (tx) => {
      await tx.communityMember.delete({
        where: {
          communityId_userId: { communityId: community.id, userId },
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "COMMUNITY_MOD_REMOVE",
        targetType: "CommunityMember",
        targetId: target.id,
        metadata: {
          communityId: community.id,
          userId,
        },
      });
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
