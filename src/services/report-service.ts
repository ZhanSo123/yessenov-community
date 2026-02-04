import {
  REPORT_AUTO_HIDE_THRESHOLD,
  REPORT_SEVERITY_AUTO_HIDE,
  REPORT_WINDOW_MS,
} from "@/lib/abuse-rules";
import { createAuditLog } from "@/lib/audit-log";
import { canModerate, type Role } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { PostRepository } from "@/repositories/post-repository";
import { ReportRepository } from "@/repositories/report-repository";
import { publishDomainEvent } from "@/services/event-publisher";

export type ReportActor = {
  id: string;
  role: Role;
};

export type ReportCreateResult =
  | { ok: true; payload: { data: unknown } }
  | { ok: false; code: "NOT_FOUND" | "BAD_REQUEST"; status: 404 | 400 };

export class ReportService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly reportRepo = new ReportRepository()
  ) {}

  async createReport(params: {
    actor: ReportActor;
    postId: number;
    reason: string;
    category?: string | null;
    severity?: number | null;
    request: Request;
  }): Promise<ReportCreateResult> {
    const { actor, postId, reason, category, severity, request } = params;

    const post = await this.postRepo.findUnique({
      where: { id: postId },
      select: {
        id: true,
        deletedAt: true,
        authorId: true,
        author: { select: { shadowBannedAt: true } },
      },
    });

    if (!post || post.deletedAt) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (
      post.author.shadowBannedAt &&
      !canModerate(actor) &&
      post.authorId !== actor.id
    ) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    let report;
    try {
      report = await this.reportRepo.create({
        data: {
          postId,
          reporterId: actor.id,
          reason,
          category: category ?? null,
          severity: severity ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }
      throw error;
    }

    const effectiveSeverity = severity ?? 1;
    const reportWindowStart = new Date(Date.now() - REPORT_WINDOW_MS);
    const recentCount = await this.reportRepo.count({
      where: {
        postId,
        createdAt: { gte: reportWindowStart },
      },
    });

    const shouldAutoHide =
      effectiveSeverity >= REPORT_SEVERITY_AUTO_HIDE ||
      recentCount >= REPORT_AUTO_HIDE_THRESHOLD;

    if (shouldAutoHide) {
      const autoReason = "Auto-hide: report threshold";
      const now = new Date();

      await prisma.$transaction(async (tx) => {
        const updated = await tx.post.updateMany({
          where: { id: postId, deletedAt: null },
          data: {
            deletedAt: now,
            deleteReason: autoReason,
            deletedById: null,
          },
        });

        if (updated.count > 0) {
          await tx.moderationAction.create({
            data: {
              source: "AUTO",
              action: "POST_HIDE",
              actorId: actor.id,
              targetType: "Post",
              targetId: String(postId),
              reason: autoReason,
              metadata: {
                reportCount: recentCount,
                severity: effectiveSeverity,
              },
            },
          });

          await createAuditLog(tx, request, {
            actor: { connect: { id: actor.id } },
            action: "POST_AUTO_HIDE",
            targetType: "Post",
            targetId: String(postId),
            metadata: {
              reason: autoReason,
              reportCount: recentCount,
              severity: effectiveSeverity,
            },
          });
        }
      });

      void publishDomainEvent("post.autohidden", {
        postId,
        actorId: actor.id,
        reason: autoReason,
        reportCount: recentCount,
        severity: effectiveSeverity,
      });
    }

    return { ok: true, payload: { data: report } };
  }
}
