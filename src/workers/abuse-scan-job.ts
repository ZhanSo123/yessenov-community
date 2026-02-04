import { getInfrastructure } from "@/infrastructure";
import { PostRepository } from "@/repositories/post-repository";
import { ModerationActionRepository } from "@/repositories/moderation-action-repository";
import { analyzePostContent } from "@/services/abuse-analysis";

const infra = getInfrastructure();
const postRepo = new PostRepository();
const moderationRepo = new ModerationActionRepository();

infra.jobQueue.register("abuse.scan.post", async (job) => {
  const payload = job.payload as { postId?: number };
  if (!payload?.postId) {
    return;
  }

  const post = await postRepo.findUnique({
    where: { id: payload.postId },
    select: { id: true, content: true, authorId: true },
  });

  if (!post?.content) {
    return;
  }

  const analysis = analyzePostContent(post.content);
  if (!analysis) {
    return;
  }

  await moderationRepo.create({
    data: {
      source: "AUTO",
      action: "POST_FLAG",
      actorId: post.authorId,
      targetType: "Post",
      targetId: String(post.id),
      reason: analysis.reason,
      metadata: analysis.metadata,
    },
  });

  await infra.realtime.emit("moderation:system", "post.flagged", {
    postId: post.id,
    reason: analysis.reason,
    metadata: analysis.metadata,
  });
});
