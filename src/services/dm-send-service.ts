import { getInfrastructure } from "@/infrastructure";
import { prisma } from "@/lib/prisma";
import { encryptText } from "@/lib/crypto/envelope";
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
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST"; status: 404 | 403 | 400 };

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
    content?: string | null;
    e2eCiphertext?: string | null;
    e2eTtlSeconds?: number | null;
  }): Promise<DmSendResult> {
    const { conversationId, senderId, content, e2eCiphertext, e2eTtlSeconds } = params;
    const trimmedContent = content?.trim() ?? "";

    const conversation = await this.conversationRepo.findUnique({
      where: { id: conversationId },
      select: { id: true, encryptionMode: true },
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

    const useE2e = conversation.encryptionMode === "E2E";
    if (useE2e) {
      if (!e2eCiphertext) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }
    } else if (!trimmedContent) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const encrypted = useE2e ? null : encryptText(trimmedContent);
    const expiresAt =
      useE2e && e2eTtlSeconds
        ? new Date(Date.now() + e2eTtlSeconds * 1000)
        : null;
    const created = await this.messageRepo.create({
      data: {
        conversationId,
        senderId,
        content: null,
        contentCiphertext: useE2e
          ? e2eCiphertext
          : encrypted?.ciphertext ?? null,
        contentIv: useE2e ? null : encrypted?.iv ?? null,
        contentTag: useE2e ? null : encrypted?.tag ?? null,
        contentKeyId: useE2e ? null : encrypted?.keyId ?? null,
        contentDekWrapped: useE2e ? null : encrypted?.dekWrapped ?? null,
        contentDekIv: useE2e ? null : encrypted?.dekIv ?? null,
        contentDekTag: useE2e ? null : encrypted?.dekTag ?? null,
        expiresAt,
      },
      select: {
        id: true,
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

    const payloadMessage = {
      id: created.id,
      content: useE2e ? e2eCiphertext! : trimmedContent,
      createdAt: created.createdAt,
      sender: created.sender,
    };

    await Promise.all(
      participants.map((participant) =>
        this.realtime.emit(`user:${participant.userId}`, "dm.message", {
          conversationId,
          message: payloadMessage,
        })
      )
    );

    return { ok: true, payload: { data: payloadMessage } };
  }
}
