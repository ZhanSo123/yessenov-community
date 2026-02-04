import { canModerate, getCommunityScope, type Role } from "@/lib/auth";
import { ModerationActionRepository } from "@/repositories/moderation-action-repository";
import { PostRepository } from "@/repositories/post-repository";
import { ReportRepository } from "@/repositories/report-repository";
import { UserRepository } from "@/repositories/user-repository";

const DEFAULT_LIMIT = 50;
const MAX_BUCKET = 200;

type QueueItem =
  | {
      type: "report";
      id: string;
      createdAt: Date;
      severity: number;
      payload: Record<string, unknown>;
    }
  | {
      type: "auto";
      id: string;
      createdAt: Date;
      payload: Record<string, unknown>;
    }
  | {
      type: "user";
      id: string;
      createdAt: Date;
      payload: Record<string, unknown>;
    }
  | {
      type: "post";
      id: number;
      createdAt: Date;
      payload: Record<string, unknown>;
    };

export type AdminQueueResult =
  | { ok: true; payload: { data: Array<Record<string, unknown>>; nextCursor: string | null } }
  | { ok: false; code: "FORBIDDEN" | "BAD_REQUEST"; status: 403 | 400 };

export class AdminQueueService {
  constructor(
    private readonly reportRepo = new ReportRepository(),
    private readonly userRepo = new UserRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly moderationRepo = new ModerationActionRepository()
  ) {}

  async getQueue(params: {
    actor: { id: string; role: Role };
    limit?: number | null;
    cursor?: string | null;
  }): Promise<AdminQueueResult> {
    const { actor } = params;
    const scope = await getCommunityScope(actor);
    const communityIds = scope?.map((item) => item.communityId) ?? null;

    if (!canModerate(actor) && (!communityIds || communityIds.length === 0)) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const limit = params.limit ?? DEFAULT_LIMIT;
    const offset = params.cursor ? Number(params.cursor) : 0;

    if (params.cursor && Number.isNaN(offset)) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const now = new Date();

    const [openReports, bannedUsers, flaggedPosts, autoActions] = await Promise.all([
      this.reportRepo.findMany({
        where: {
          status: "OPEN",
          ...(communityIds ? { post: { communityId: { in: communityIds } } } : {}),
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
        take: MAX_BUCKET,
        include: {
          post: {
            select: {
              id: true,
              content: true,
              deletedAt: true,
              communityId: true,
              author: { select: { id: true, username: true, name: true } },
            },
          },
          reporter: { select: { id: true, email: true, username: true, name: true } },
        },
      }),
      canModerate(actor)
        ? this.userRepo.findMany({
            where: { bannedUntil: { gt: now } },
            orderBy: { bannedUntil: "desc" },
            take: MAX_BUCKET,
            select: {
              id: true,
              email: true,
              username: true,
              role: true,
              bannedUntil: true,
              banReason: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      this.postRepo.findMany({
        where: {
          reports: {
            some: { status: "OPEN", severity: { gte: 2 } },
          },
          ...(communityIds ? { communityId: { in: communityIds } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: MAX_BUCKET,
        include: {
          author: { select: { id: true, username: true, name: true } },
          reports: {
            where: { status: "OPEN" },
            select: { severity: true },
            take: 5,
          },
        },
      }),
      this.moderationRepo.findMany({
        where: { source: "AUTO" },
        orderBy: { createdAt: "desc" },
        take: MAX_BUCKET,
      }),
    ]);

    const reportItems: QueueItem[] = openReports.map((report) => ({
      type: "report",
      id: report.id,
      createdAt: report.createdAt,
      severity: report.severity ?? 1,
      payload: report,
    }));

    const userItems: QueueItem[] = bannedUsers.map((user) => ({
      type: "user",
      id: user.id,
      createdAt: user.bannedUntil ?? user.createdAt,
      payload: user,
    }));

    const postItems: QueueItem[] = flaggedPosts.map((post) => ({
      type: "post",
      id: post.id,
      createdAt: post.createdAt,
      payload: {
        ...post,
        maxSeverity: Math.max(1, ...post.reports.map((report) => report.severity ?? 1)),
      },
    }));

    let filteredAutoActions = autoActions;
    if (communityIds) {
      const postIds = autoActions
        .filter((action) => action.targetType === "Post")
        .map((action) => Number(action.targetId))
        .filter((id) => !Number.isNaN(id));

      const communityPosts = postIds.length
        ? await this.postRepo.findMany({
            where: { id: { in: postIds }, communityId: { in: communityIds } },
            select: { id: true },
          })
        : [];
      const allowedPostIds = new Set(communityPosts.map((post) => post.id));

      filteredAutoActions = autoActions.filter((action) => {
        if (action.targetType !== "Post") {
          return false;
        }

        const postId = Number(action.targetId);
        return allowedPostIds.has(postId);
      });
    }

    const autoItems: QueueItem[] = filteredAutoActions.map((action) => ({
      type: "auto",
      id: action.id,
      createdAt: action.createdAt,
      payload: action,
    }));

    const combined = [...reportItems, ...autoItems, ...userItems, ...postItems].sort((a, b) => {
      const priority = (item: QueueItem) => {
        if (item.type === "report") return 0;
        if (item.type === "auto") return 1;
        if (item.type === "user") return 2;
        return 3;
      };

      const priorityDiff = priority(a) - priority(b);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      if (a.type === "report" && b.type === "report") {
        const severityDiff = (b.severity ?? 1) - (a.severity ?? 1);
        if (severityDiff !== 0) {
          return severityDiff;
        }
      }

      const dateDiff = a.createdAt.getTime() - b.createdAt.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return String(a.id).localeCompare(String(b.id));
    });

    const sliced = combined.slice(offset, offset + limit);
    const nextCursor = offset + limit < combined.length ? String(offset + limit) : null;

    return {
      ok: true,
      payload: {
        data: sliced.map((item) => ({
          type: item.type,
          ...item.payload,
        })),
        nextCursor,
      },
    };
  }
}
