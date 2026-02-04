import { canModerate, type Role } from "@/lib/auth";
import { PostRepository } from "@/repositories/post-repository";
import { ReportRepository } from "@/repositories/report-repository";
import { UserRepository } from "@/repositories/user-repository";

export type AdminDashboardActor = { id: string; role: Role };

export type AdminDashboardResult =
  | { ok: true; payload: { data: Record<string, number> } }
  | { ok: false; code: "FORBIDDEN"; status: 403 };

export class AdminDashboardService {
  constructor(
    private readonly reportRepo = new ReportRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly userRepo = new UserRepository()
  ) {}

  async getDashboard(params: {
    actor: AdminDashboardActor;
    communityIds: number[] | null;
  }): Promise<AdminDashboardResult> {
    const { actor, communityIds } = params;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const now = new Date();

    const [openReports, deletedPosts, bannedUsers, shadowBannedUsers] =
      await Promise.all([
        this.reportRepo.count({
          where: {
            status: "OPEN",
            ...(communityIds
              ? { post: { communityId: { in: communityIds } } }
              : {}),
          },
        }),
        this.postRepo.count({
          where: {
            deletedAt: { not: null },
            ...(communityIds ? { communityId: { in: communityIds } } : {}),
          },
        }),
        canModerate(actor)
          ? this.userRepo.count({ where: { bannedUntil: { gt: now } } })
          : Promise.resolve(0),
        canModerate(actor)
          ? this.userRepo.count({ where: { shadowBannedAt: { not: null } } })
          : Promise.resolve(0),
      ]);

    return {
      ok: true,
      payload: {
        data: {
          openReports,
          deletedPosts,
          bannedUsers,
          shadowBannedUsers,
        },
      },
    };
  }
}
