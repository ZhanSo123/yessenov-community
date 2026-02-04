import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppealRepository } from "@/repositories/appeal-repository";
import { PostRepository } from "@/repositories/post-repository";
import { publishDomainEvent } from "@/services/event-publisher";

export type AdminAppealResolveActor = { id: string; role: Role };

export type AdminAppealResolveResult =
  | { ok: true; payload: { data: unknown } }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST";
      status: 404 | 403 | 400;
    };

export class AdminAppealResolveService {
  constructor(
    private readonly appealRepo = new AppealRepository(),
    private readonly postRepo = new PostRepository()
  ) {}

  async resolveAppeal(params: {
    actor: AdminAppealResolveActor;
    appealId: string;
    status: "APPROVED" | "DENIED";
    note?: string | null;
    request: Request;
  }): Promise<AdminAppealResolveResult> {
    const { actor, appealId, status, note, request } = params;

    const appeal = await this.appealRepo.findUnique({
      where: { id: appealId },
      select: { id: true, targetType: true, targetId: true },
    });

    if (!appeal) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (!canModerate(actor)) {
      if (appeal.targetType !== "POST") {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }

      const postId = Number(appeal.targetId);
      if (Number.isNaN(postId)) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }

      const post = await this.postRepo.findUnique({
        where: { id: postId },
        select: { communityId: true },
      });

      if (!post?.communityId) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }

      const role = await getCommunityModeratorRole(post.communityId, actor.id);
      if (!role) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
    }

    const resolutionAction =
      status === "APPROVED" ? "APPEAL_APPROVE" : "APPEAL_DENY";

    const updated = await prisma.$transaction(async (tx) => {
      const resolved = await tx.appeal.update({
        where: { id: appealId },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedById: actor.id,
          resolutionNote: note ?? null,
        },
      });

      if (status === "APPROVED") {
        if (appeal.targetType === "POST") {
          const postId = Number(appeal.targetId);
          if (!Number.isNaN(postId)) {
            await tx.post.update({
              where: { id: postId },
              data: {
                deletedAt: null,
                deletedById: null,
                deleteReason: null,
              },
            });
          }
        }

        if (appeal.targetType.startsWith("USER")) {
          await tx.user.update({
            where: { id: appeal.targetId },
            data: {
              bannedUntil: null,
              banReason: null,
              shadowBannedAt: null,
              shadowBanReason: null,
            },
          });
        }
      }

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: resolutionAction,
        targetType: "Appeal",
        targetId: resolved.id,
        metadata: {
          status,
          note: note ?? null,
          targetType: appeal.targetType,
          targetId: appeal.targetId,
        },
      });

      return resolved;
    });

    void publishDomainEvent("appeal.resolved", {
      appealId: updated.id,
      status,
      actorId: actor.id,
      targetType: appeal.targetType,
      targetId: appeal.targetId,
    });

    return { ok: true, payload: { data: updated } };
  }
}
