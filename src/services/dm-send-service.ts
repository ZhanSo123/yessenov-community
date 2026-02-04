import { getInfrastructure } from "@/infrastructure";
import { prisma } from "@/lib/prisma";
import { ConversationParticipantRepository } from "@/repositories/conversation-participant-repository";
import { ConversationRepository } from "@/repositories/conversation-repository";
import { MessageRepository } from "@/repositories/message-repository";

export type DmSendResult =
  | {
      ok: true;
      payload: {
        data: {
          id: string;
          content: string;
          createdAt: Date;
          sender: {
            id: string;
            username: string | null;
            displayName: string | null;
            image: string | null;
          };
        };
      };
    }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; status: 404 | 403 };

export class DmSendService {
  constructor(
    private readonly conversationRepo = new ConversationRepository(),
    private readonly participantRepo = new ConversationParticipantRepository(),
    private readonly messageRepo = new MessageRepository(),
    private readonly cache = getInfrastructure().cache,
    private readonly realtime = getInfrastructure().realtime
  ) {}

  async sendMessage(params: {
    conversationId: string;
    senderId: string;
    content: string;
  }): Promise<DmSendResult> {
    const { conversationId, senderId, content } = params;

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
          userId: senderId,
        },
      },
      select: { userId: true },
    });

    if (!participant) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const created = await this.messageRepo.create({
      data: {
        conversationId,
        senderId,
        content: content.trim(),
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
      },
    });

    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: created.createdAt,
          lastMessageId: created.id,
        },
      }),
      prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: senderId,
          },
        },
        data: { lastReadAt: created.createdAt },
      }),
    ]);

    await this.cache.del(`dm:thread:${conversationId}:`);
    await this.cache.del(`dm:inbox:${senderId}:`);
    await this.cache.del("dm:inbox:");

    const participants = await this.participantRepo.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    await Promise.all(
      participants.map((participant) =>
        this.realtime.emit(`user:${participant.userId}`, "dm.message", {
          conversationId,
          message: created,
        })
      )
    );

    return { ok: true, payload: { data: created } };
  }
}
