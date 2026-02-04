import { performance } from "node:perf_hooks";

import { buildCursorString } from "@/lib/pagination";
import { getInfrastructure } from "@/infrastructure";
import { decryptText } from "@/lib/crypto/envelope";
import { ConversationRepository } from "@/repositories/conversation-repository";
import { MessageRepository } from "@/repositories/message-repository";

export type DmViewer = {
  id: string;
  role: string;
};

export type DmThreadResult =
  | {
      ok: true;
      payload: {
        data: {
          conversation: {
            id: string;
            encryptionMode: "CLOUD" | "E2E";
            participants: Array<{
              id: string;
              username: string | null;
              displayName: string | null;
              image: string | null;
            }>;
          };
          messages: Array<{
            id: string;
            content: string;
            createdAt: Date;
            sender: {
              id: string;
              username: string | null;
              displayName: string | null;
              image: string | null;
            };
          }>;
        };
        nextCursor: string | null;
      };
      cacheKey: string;
      cached: boolean;
    }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; status: 404 | 403 };

const THREAD_CACHE_TTL_MS = 12 * 1000;
const ALLOW_PLAINTEXT_DM_CACHE = process.env.DM_CACHE_PLAINTEXT === "true";

export class DmThreadService {
  constructor(
    private readonly conversationRepo = new ConversationRepository(),
    private readonly messageRepo = new MessageRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async getThread(params: {
    conversationId: string;
    viewer: DmViewer;
    limit: number;
    cursor: { createdAt: Date; id: string } | null;
    cursorToken: string | null;
    logDb?: (query: string, ms: number) => void;
  }): Promise<DmThreadResult> {
    const { conversationId, viewer, limit, cursor, cursorToken, logDb } = params;
    const cacheKey = `dm:thread:${conversationId}:${viewer.id}:${viewer.role}:${limit}:${cursorToken ?? "none"}`;
    const now = new Date();

    if (ALLOW_PLAINTEXT_DM_CACHE) {
      const cached = await this.cache.get<DmThreadResult["payload"]>(cacheKey);
      if (cached) {
        return { ok: true, payload: cached, cacheKey, cached: true };
      }
    }

    const conversationStart = performance.now();
    const conversation = await this.conversationRepo.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        encryptionMode: true,
        participants: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                image: true,
              },
            },
          },
        },
      },
    });
    if (logDb) {
      logDb("conversation.findUnique", performance.now() - conversationStart);
    }

    if (!conversation) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    const isParticipant = conversation.participants.some(
      (participant) => participant.userId === viewer.id
    );
    if (!isParticipant) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const baseWhere = {
      conversationId: conversationId,
      deletedAt: null,
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      ],
    };

    const messageWhere = cursor
      ? {
          ...baseWhere,
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : baseWhere;

    const messagesStart = performance.now();
    const messages = await this.messageRepo.findMany({
      where: messageWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        content: true,
        contentCiphertext: true,
        contentIv: true,
        contentTag: true,
        contentKeyId: true,
        contentDekWrapped: true,
        contentDekIv: true,
        contentDekTag: true,
        expiresAt: true,
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
    if (logDb) {
      logDb("message.findMany", performance.now() - messagesStart);
    }

    const hasMore = messages.length > limit;
    const sliced = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    const resolveContent = (message: (typeof sliced)[number]) => {
      if (conversation.encryptionMode === "E2E") {
        return message.contentCiphertext ?? "Encrypted message";
      }
      if (message.contentCiphertext && message.contentIv && message.contentTag) {
        const decrypted = decryptText({
          ciphertext: message.contentCiphertext,
          iv: message.contentIv,
          tag: message.contentTag,
          keyId: message.contentKeyId,
          dekWrapped: message.contentDekWrapped,
          dekIv: message.contentDekIv,
          dekTag: message.contentDekTag,
        });
        if (decrypted !== null) {
          return decrypted;
        }
      }
      return message.content ?? "Encrypted message";
    };

    const payload = {
      data: {
        conversation: {
          id: conversation.id,
          encryptionMode: conversation.encryptionMode,
          participants: conversation.participants.map((participant) => ({
            id: participant.user.id,
            username: participant.user.username,
            displayName: participant.user.displayName,
            image: participant.user.image,
          })),
        },
        messages: sliced.map((message) => ({
          id: message.id,
          content: resolveContent(message),
          createdAt: message.createdAt,
          sender: message.sender,
        })),
      },
      nextCursor,
    };

    if (ALLOW_PLAINTEXT_DM_CACHE && conversation.encryptionMode === "CLOUD") {
      await this.cache.set(cacheKey, payload, THREAD_CACHE_TTL_MS);
    }

    return { ok: true, payload, cacheKey, cached: false };
  }
}
