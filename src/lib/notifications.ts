import { NotificationType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const dedupeLike = async (input: {
  userId: string;
  actorId: string;
  postId: number;
}) => {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      actorId: input.actorId,
      postId: input.postId,
      type: "LIKE",
      readAt: null,
    },
    select: { id: true },
  });

  return Boolean(existing);
};

const dedupeFollow = async (input: { userId: string; actorId: string }) => {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      actorId: input.actorId,
      type: "FOLLOW",
      readAt: null,
    },
    select: { id: true },
  });

  return Boolean(existing);
};

type CreateNotificationInput = {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  postId?: number | null;
  replyId?: number | null;
};

export const createNotification = async (input: CreateNotificationInput) => {
  if (!input.userId) {
    return null;
  }

  if (input.actorId && input.actorId === input.userId) {
    return null;
  }

  try {
    if (input.type === "LIKE" && input.actorId && input.postId) {
      const exists = await dedupeLike({
        userId: input.userId,
        actorId: input.actorId,
        postId: input.postId,
      });
      if (exists) {
        return null;
      }
    }

    if (input.type === "FOLLOW" && input.actorId) {
      const exists = await dedupeFollow({
        userId: input.userId,
        actorId: input.actorId,
      });
      if (exists) {
        return null;
      }
    }

    return await prisma.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        type: input.type,
        postId: input.postId ?? null,
        replyId: input.replyId ?? null,
      },
    });
  } catch {
    return null;
  }
};

const mentionRegex = /@([a-zA-Z0-9._]{3,20})/g;

export const createMentionNotifications = async (
  content: string,
  actorId: string,
  postId?: number | null
) => {
  if (!content) {
    return;
  }

  const mentions = new Set<string>();
  mentionRegex.lastIndex = 0;
  let match = mentionRegex.exec(content);
  while (match) {
    if (match[1]) {
      mentions.add(match[1].toLowerCase());
    }
    match = mentionRegex.exec(content);
  }

  if (mentions.size === 0) {
    return;
  }

  try {
    const users = await prisma.user.findMany({
      where: { usernameLower: { in: Array.from(mentions) } },
      select: { id: true },
    });

    await Promise.all(
      users
        .filter((user) => user.id !== actorId)
        .map((user) =>
          createNotification({
            userId: user.id,
            actorId,
            type: "MENTION",
            postId: postId ?? null,
          })
        )
    );
  } catch {
    return;
  }
};
