import { createMentionNotifications, createNotification } from "@/lib/notifications";
import { getInfrastructure } from "@/infrastructure";
import { ModerationActionRepository } from "@/repositories/moderation-action-repository";
import { analyzePostContent } from "@/services/abuse-analysis";

let registered = false;

export const registerEventHandlers = () => {
  if (registered) {
    return;
  }
  registered = true;

  const infra = getInfrastructure();
  const moderationRepo = new ModerationActionRepository();

  const flagPostIfNeeded = async (payload: {
    postId?: number;
    authorId?: string;
    content?: string;
    reasonHint?: string;
  }) => {
    if (!payload.postId || !payload.content) {
      return;
    }

    const analysis = analyzePostContent(payload.content);
    if (!analysis) {
      return;
    }

    await moderationRepo.create({
      data: {
        source: "AUTO",
        action: "POST_FLAG",
        actorId: payload.authorId ?? null,
        targetType: "Post",
        targetId: String(payload.postId),
        reason: analysis.reason,
        metadata: analysis.metadata,
      },
    });

    await infra.realtime.emit("moderation:system", "post.flagged", {
      postId: payload.postId,
      reason: analysis.reason,
      metadata: analysis.metadata,
    });
  };

  infra.eventBus.subscribe("user.followed", async (event) => {
    // Example: future async analytics pipeline
    void event;
  });

  infra.eventBus.subscribe("post.created", async (event) => {
    const payload = event.payload as {
      postId?: number;
      authorId?: string;
      content?: string;
    };

    if (payload?.postId && payload.content && payload.authorId) {
      await createMentionNotifications(payload.content, payload.authorId, payload.postId);
    }

    if (payload?.postId && payload.content) {
      await infra.search.upsert([
        {
          id: `post:${payload.postId}`,
          text: payload.content,
          metadata: { postId: payload.postId, authorId: payload.authorId ?? null },
        },
      ]);
    }

    if (process.env.JOB_QUEUE_PROVIDER !== "postgres") {
      await flagPostIfNeeded(payload);
    }
  });

  infra.eventBus.subscribe("post.liked", async (event) => {
    void event;
  });

  infra.eventBus.subscribe("post.replied", async (event) => {
    const payload = event.payload as {
      postId?: number;
      authorId?: string;
      content?: string;
    };

    if (payload?.postId && payload.content && payload.authorId) {
      await createMentionNotifications(payload.content, payload.authorId, payload.postId);
    }

    if (payload?.postId && payload.content) {
      await infra.search.upsert([
        {
          id: `post:${payload.postId}`,
          text: payload.content,
          metadata: { postId: payload.postId, authorId: payload.authorId ?? null },
        },
      ]);
    }

    if (process.env.JOB_QUEUE_PROVIDER !== "postgres") {
      await flagPostIfNeeded(payload);
    }
  });

  infra.eventBus.subscribe("post.reposted", async (event) => {
    void event;
  });

  infra.eventBus.subscribe("user.banned", async (event) => {
    const payload = event.payload as {
      userId?: string;
      bannedUntil?: string | Date | null;
      reason?: string | null;
    };
    if (!payload?.userId) {
      return;
    }
    await infra.realtime.emit(`user:${payload.userId}`, "user.banned", {
      bannedUntil: payload.bannedUntil ?? null,
      reason: payload.reason ?? null,
    });
  });

  infra.eventBus.subscribe("user.unbanned", async (event) => {
    const payload = event.payload as { userId?: string };
    if (!payload?.userId) {
      return;
    }
    await infra.realtime.emit(`user:${payload.userId}`, "user.unbanned", {});
  });

  infra.eventBus.subscribe("user.shadowbanned", async (event) => {
    const payload = event.payload as { userId?: string; reason?: string | null };
    if (!payload?.userId) {
      return;
    }
    await infra.realtime.emit(`user:${payload.userId}`, "user.shadowbanned", {
      reason: payload.reason ?? null,
    });
  });

  infra.eventBus.subscribe("user.shadowunbanned", async (event) => {
    const payload = event.payload as { userId?: string };
    if (!payload?.userId) {
      return;
    }
    await infra.realtime.emit(`user:${payload.userId}`, "user.shadowunbanned", {});
  });

  infra.eventBus.subscribe("post.deleted", async (event) => {
    const payload = event.payload as {
      postId?: number;
      authorId?: string;
      reason?: string | null;
    };
    if (!payload?.authorId || !payload.postId) {
      return;
    }
    await infra.realtime.emit(`user:${payload.authorId}`, "post.deleted", {
      postId: payload.postId,
      reason: payload.reason ?? null,
    });
  });

  infra.eventBus.subscribe("post.restored", async (event) => {
    const payload = event.payload as { postId?: number; authorId?: string };
    if (!payload?.authorId || !payload.postId) {
      return;
    }
    await infra.realtime.emit(`user:${payload.authorId}`, "post.restored", {
      postId: payload.postId,
    });
  });

  infra.eventBus.subscribe("post.autohidden", async (event) => {
    const payload = event.payload as { postId?: number; reason?: string | null };
    if (!payload?.postId) {
      return;
    }
    await infra.realtime.emit("moderation:system", "post.autohidden", {
      postId: payload.postId,
      reason: payload.reason ?? null,
    });
  });

  infra.eventBus.subscribe("notification.dispatch", async (event) => {
    const payload = event.payload as {
      userId: string;
      actorId?: string | null;
      type: "REPLY" | "LIKE" | "FOLLOW" | "MENTION";
      postId?: number | null;
      replyId?: number | null;
    };

    if (!payload?.userId || !payload.type) {
      return;
    }

    await createNotification({
      userId: payload.userId,
      actorId: payload.actorId ?? null,
      type: payload.type,
      postId: payload.postId ?? null,
      replyId: payload.replyId ?? null,
    });
  });
};
