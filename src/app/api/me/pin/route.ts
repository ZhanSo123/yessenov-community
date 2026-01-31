import { NextRequest } from "next/server";

import { auth } from "@/auth";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { PinPostSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = PinPostSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const session = await auth();
    if (!session?.user?.id) {
      return apiError("UNAUTHORIZED", 401);
    }

    const { postId } = parsed.data;

    if (postId === null) {
      const updated = await prisma.user.update({
        where: { id: session.user.id },
        data: { pinnedPostId: null },
        select: { pinnedPostId: true },
      });
      return apiSuccess({ data: updated });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, replyToId: true, deletedAt: true },
    });

    if (!post) {
      return apiError("NOT_FOUND", 404);
    }

    if (post.authorId !== session.user.id) {
      return apiError("FORBIDDEN", 403);
    }

    if (post.replyToId !== null || post.deletedAt) {
      return apiError("BAD_REQUEST", 400, { message: "INVALID_PIN" });
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { pinnedPostId: postId },
      select: { pinnedPostId: true },
    });

    return apiSuccess({ data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
