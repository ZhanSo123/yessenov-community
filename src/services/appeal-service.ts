import { createAuditLog } from "@/lib/audit-log";
import { type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppealRepository } from "@/repositories/appeal-repository";
import { PostRepository } from "@/repositories/post-repository";
import { UserRepository } from "@/repositories/user-repository";

export type AppealActor = {
  id: string;
  role: Role;
};

export type AppealCreateResult =
  | { ok: true; payload: { data: unknown } }
  | { ok: false; code: "BAD_REQUEST" | "NOT_FOUND"; status: 400 | 404 };

export class AppealService {
  constructor(
    private readonly appealRepo = new AppealRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly userRepo = new UserRepository()
  ) {}

  async createAppeal(params: {
    actor: AppealActor;
    targetType: string;
    targetId: string;
    reason: string;
    request: Request;
  }): Promise<AppealCreateResult> {
    const { actor, targetType, targetId, reason, request } = params;

    const existing = await this.appealRepo.findFirst({
      where: {
        userId: actor.id,
        targetType,
        targetId,
        status: "OPEN",
      },
      select: { id: true },
    });

    if (existing) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    if (targetType === "POST") {
      const postId = Number(targetId);
      if (Number.isNaN(postId)) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }
      const postExists = await this.postRepo.findUnique({
        where: { id: postId },
        select: { id: true },
      });
      if (!postExists) {
        return { ok: false, code: "NOT_FOUND", status: 404 };
      }
    }

    if (targetType.startsWith("USER")) {
      const userExists = await this.userRepo.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!userExists) {
        return { ok: false, code: "NOT_FOUND", status: 404 };
      }
    }

    const appeal = await prisma.$transaction(async (tx) => {
      const created = await tx.appeal.create({
        data: {
          userId: actor.id,
          targetType,
          targetId,
          reason,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action: "APPEAL_CREATE",
        targetType: "Appeal",
        targetId: created.id,
        metadata: {
          targetType,
          targetId,
        },
      });

      return created;
    });

    return { ok: true, payload: { data: appeal } };
  }
}
