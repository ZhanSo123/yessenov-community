import { AuditLogRepository } from "@/repositories/audit-log-repository";
import { PostRepository } from "@/repositories/post-repository";
import { ReportRepository } from "@/repositories/report-repository";
import { UserRepository } from "@/repositories/user-repository";

export class AdminRangeMetricsService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly reportRepo = new ReportRepository(),
    private readonly auditRepo = new AuditLogRepository()
  ) {}

  async getMetrics(rangeMs: number) {
    const since = new Date(Date.now() - rangeMs);

    const [
      newUsers,
      newPosts,
      deletedPosts,
      openReports,
      resolvedReports,
      bans,
      shadowbans,
    ] = await Promise.all([
      this.userRepo.count({ where: { createdAt: { gte: since } } }),
      this.postRepo.count({ where: { createdAt: { gte: since } } }),
      this.postRepo.count({ where: { deletedAt: { gte: since } } }),
      this.reportRepo.count({ where: { status: "OPEN" } }),
      this.reportRepo.count({ where: { resolvedAt: { gte: since } } }),
      this.auditRepo.count({
        where: { action: "USER_BAN", createdAt: { gte: since } },
      }),
      this.auditRepo.count({
        where: { action: "USER_SHADOWBAN", createdAt: { gte: since } },
      }),
    ]);

    return {
      newUsers,
      newPosts,
      deletedPosts,
      openReports,
      resolvedReports,
      bans,
      shadowbans,
    };
  }
}
