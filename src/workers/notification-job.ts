import { getInfrastructure } from "@/infrastructure";
import { createNotification } from "@/lib/notifications";

const infra = getInfrastructure();

infra.jobQueue.register("notification.dispatch", async (job) => {
  const payload = job.payload as {
    userId?: string;
    actorId?: string | null;
    type?: "REPLY" | "LIKE" | "FOLLOW" | "MENTION";
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
