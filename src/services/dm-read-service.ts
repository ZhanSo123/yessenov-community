import { getInfrastructure } from "@/infrastructure";
import { ConversationParticipantRepository } from "@/repositories/conversation-participant-repository";
import { ConversationRepository } from "@/repositories/conversation-repository";

export type DmReadResult =
  | { ok: true; payload: { ok: true } }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; status: 404 | 403 };

export class DmReadService {
  constructor(
    private readonly conversationRepo = new ConversationRepository(),
    private readonly participantRepo = new ConversationParticipantRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async markRead(params: {
    conversationId: string;
    userId: string;
  }): Promise<DmReadResult> {
    const { conversationId, userId } = params;

    const conversation = await this.conversationRepo.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });

    if (!conversation) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const participant = await this.participantRepo.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: { userId: true },
    });

    if (!participant) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    await this.participantRepo.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: new Date() },
    });

    await this.cache.del(`dm:thread:${conversationId}:`);
    await this.cache.del(`dm:inbox:${userId}:`);

    return { ok: true, payload: { ok: true } };
  }
}
