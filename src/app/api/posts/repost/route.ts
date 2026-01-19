import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  canModerate,
  ensureNotBanned,
  ensureInviteAccepted,
  ensureOnboarded,
  requireUserApi,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const repostSchema = z.object({
  repostOfId: z.number().int(),
});

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = repostSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const author = await requireUserApi();
    ensureInviteAccepted(author);
    ensureNotBanned(author);
    ensureOnboarded(author);

    const parent = await prisma.post.findUnique({
      where: { id: parsed.data.repostOfId },
      select: {
        id: true,
        deletedAt: true,
        communityId: true,
        authorId: true,
        author: { select: { shadowBannedAt: true } },
      },
    });

    if (!parent || parent.deletedAt) {
      return apiError("NOT_FOUND", 404);
    }

    if (
      parent.author.shadowBannedAt &&
      !canModerate(author) &&
      parent.authorId !== author.id
    ) {
      return apiError("NOT_FOUND", 404);
    }

    const repost = await prisma.post.create({
      data: {
        content: "",
        authorId: author.id,
        repostOfId: parsed.data.repostOfId,
        communityId: parent.communityId ?? null,
      },
      include: {
        author: { select: { id: true, username: true, name: true, image: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });

    return apiSuccess(
      { data: { ...repost, viewerHasLiked: false, canViewDeleted: true } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
