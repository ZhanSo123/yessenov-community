import { prisma } from "@/lib/prisma";
import { FeedbackRepository } from "@/repositories/feedback-repository";
import { PostRepository } from "@/repositories/post-repository";
import { UserRepository } from "@/repositories/user-repository";

export class AdminMetricsService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly feedbackRepo = new FeedbackRepository()
  ) {}

  async getAlphaMetrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      usersInvitedAccepted,
      usersOnboarded,
      postsLast24h,
      repliesLast24h,
      feedbackLast24h,
    ] = await prisma.$transaction([
      this.userRepo.count({}),
      this.userRepo.count({ where: { inviteAcceptedAt: { not: null } } }),
      this.userRepo.count({ where: { username: { not: null } } }),
      this.postRepo.count({
        where: { replyToId: null, createdAt: { gte: since } },
      }),
      this.postRepo.count({
        where: { replyToId: { not: null }, createdAt: { gte: since } },
      }),
      this.feedbackRepo.count({ where: { createdAt: { gte: since } } }),
    ]);

    return {
      usersTotal,
      usersInvitedAccepted,
      usersOnboarded,
      postsLast24h,
      repliesLast24h,
      feedbackLast24h,
    };
  }
}
