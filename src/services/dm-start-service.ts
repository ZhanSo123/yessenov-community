import { prisma } from "@/lib/prisma";
import { ConversationRepository } from "@/repositories/conversation-repository";
import { UserRepository } from "@/repositories/user-repository";

export type DmStartResult =
  | { ok: true; payload: { data: { conversationId: string } } }
  | {
      ok: false;
      code: "NOT_FOUND" | "BAD_REQUEST";
      status: 404 | 400;
      meta?: { message?: string };
    };

export class DmStartService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly conversationRepo = new ConversationRepository()
  ) {}

  async startConversation(params: {
    actorId: string;
    targetUsernameLower: string;
    mode?: "CLOUD" | "E2E";
  }): Promise<DmStartResult> {
    const { actorId, targetUsernameLower, mode = "CLOUD" } = params;

    const target = await this.userRepo.findUnique({
      where: { usernameLower: targetUsernameLower },
      select: { id: true },
    });

    if (!target) {
      return {
        ok: false,
        code: "NOT_FOUND",
        status: 404,
        meta: { message: "USER_NOT_FOUND" },
      };
    }

    if (target.id === actorId) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        status: 400,
        meta: { message: "CANNOT_MESSAGE_SELF" },
      };
    }

    const existing = await this.conversationRepo.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: actorId } } },
          { participants: { some: { userId: target.id } } },
          { encryptionMode: mode },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return { ok: true, payload: { data: { conversationId: existing.id } } };
    }

    const created = await prisma.$transaction(async (tx) => {
      const again = await tx.conversation.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: actorId } } },
            { participants: { some: { userId: target.id } } },
            { encryptionMode: mode },
          ],
        },
        select: { id: true },
      });

      if (again) {
        return again;
      }

      return tx.conversation.create({
        data: {
          encryptionMode: mode,
          participants: {
            create: [{ userId: actorId }, { userId: target.id }],
          },
        },
        select: { id: true },
      });
    });

    return { ok: true, payload: { data: { conversationId: created.id } } };
  }
}
