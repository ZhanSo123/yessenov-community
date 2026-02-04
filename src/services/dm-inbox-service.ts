import { performance } from "node:perf_hooks";
import { Prisma } from "@prisma/client";

import { getInfrastructure } from "@/infrastructure";
import { prisma } from "@/lib/prisma";
import { decryptText } from "@/lib/crypto/envelope";
import { ConversationParticipantRepository } from "@/repositories/conversation-participant-repository";
import { MessageRepository } from "@/repositories/message-repository";

export type DmInboxViewer = {
  id: string;
  role: string;
};

type InboxCursor = {
  lastMessageAt: Date | null;
  id: string;
};

type LastMessageRow = {
  id: string;
  content: string | null;
  contentCiphertext?: string | null;
  contentIv?: string | null;
  contentTag?: string | null;
  contentKeyId?: string | null;
  contentDekWrapped?: string | null;
  contentDekIv?: string | null;
  contentDekTag?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
  senderId: string;
};

export type DmInboxResult =
  | {
      ok: true;
      payload: {
        data: Array<{
          id: string;
          encryptionMode: "CLOUD" | "E2E";
          participant: {
            username: string | null;
            displayName: string | null;
            image: string | null;
          } | null;
          lastMessage: {
            id: string;
            content: string;
            createdAt: Date;
            senderId: string;
          } | null;
          lastMessageAt: Date | null;
          unreadCount: number;
        }>;
        nextCursor: string | null;
      };
      cacheKey: string;
      cached: boolean;
    }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

const INBOX_CACHE_TTL_MS = 12 * 1000;
const ALLOW_PLAINTEXT_DM_CACHE = process.env.DM_CACHE_PLAINTEXT === "true";

const parseInboxCursor = (value: string | null | undefined): InboxCursor | null => {
  if (!value) {
    return null;
  }

  const [timePart, idPart] = value.split("|");
  if (!timePart || !idPart) {
    return null;
  }

  if (timePart === "null") {
    return { lastMessageAt: null, id: idPart };
  }

  const date = new Date(timePart);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return { lastMessageAt: date, id: idPart };
};

const buildInboxCursor = (value: Date | null, id: string) =>
  `${value ? value.toISOString() : "null"}|${id}`;

export class DmInboxService {
  constructor(
    private readonly participantRepo = new ConversationParticipantRepository(),
    private readonly messageRepo = new MessageRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async getInbox(params: {
    viewer: DmInboxViewer;
    limit: number;
    cursorToken: string | null;
    logDb?: (query: string, ms: number) => void;
  }): Promise<DmInboxResult> {
    const { viewer, limit, cursorToken, logDb } = params;
    const cursor = parseInboxCursor(cursorToken);
    if (cursorToken && !cursor) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const cacheKey = `dm:inbox:${viewer.id}:${viewer.role}:${limit}:${cursorToken ?? "none"}`;
    if (ALLOW_PLAINTEXT_DM_CACHE) {
      const cached = await this.cache.get<DmInboxResult["payload"]>(cacheKey);
      if (cached) {
        return { ok: true, payload: cached, cacheKey, cached: true };
      }
    }

    const where: Prisma.ConversationParticipantWhereInput = { userId: viewer.id };

    if (cursor) {
      if (cursor.lastMessageAt === null) {
        where.conversation = {
          lastMessageAt: null,
          id: { lt: cursor.id },
        };
      } else {
        where.conversation = {
          OR: [
            { lastMessageAt: { lt: cursor.lastMessageAt } },
            { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } },
            { lastMessageAt: null },
          ],
        };
      }
    }

    const participantsStart = performance.now();
    const records = await this.participantRepo.findMany({
      where,
      orderBy: [
        { conversation: { lastMessageAt: "desc" } },
        { conversationId: "desc" },
      ],
      take: limit + 1,
      select: {
        conversationId: true,
        lastReadAt: true,
        conversation: {
          select: {
            id: true,
            lastMessageAt: true,
            lastMessageId: true,
            encryptionMode: true,
            participants: {
              where: { userId: { not: viewer.id } },
              select: {
                user: {
                  select: {
                    username: true,
                    displayName: true,
                    image: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (logDb) {
      logDb("conversationParticipant.findMany", performance.now() - participantsStart);
    }

    const hasMore = records.length > limit;
    const sliced = hasMore ? records.slice(0, limit) : records;
    const nextCursor = hasMore
      ? buildInboxCursor(
          sliced[sliced.length - 1].conversation.lastMessageAt,
          sliced[sliced.length - 1].conversationId
        )
      : null;

    const lastMessageIds = sliced
      .map((item) => item.conversation.lastMessageId)
      .filter((id): id is string => Boolean(id));

    const now = new Date();
    let lastMessages: LastMessageRow[] = [];
    if (lastMessageIds.length) {
      const lastMessagesStart = performance.now();
      lastMessages = await this.messageRepo.findMany({
        where: {
          id: { in: lastMessageIds },
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
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
          senderId: true,
        },
      });
      if (logDb) {
        logDb("message.findMany.lastMessages", performance.now() - lastMessagesStart);
      }
    }

    const lastMessageMap = new Map(
      lastMessages.map((message) => [message.id, message])
    );

    const conversationIds = sliced.map((item) => item.conversationId);
    let unreadRows: { conversationId: string; count: number }[] = [];
    if (conversationIds.length > 0) {
      const unreadStart = performance.now();
      unreadRows = await prisma.$queryRaw<
        { conversationId: string; count: number }[]
      >(Prisma.sql`
        SELECT
          m."conversationId" AS "conversationId",
          COUNT(*)::int AS "count"
        FROM "Message" m
        JOIN "ConversationParticipant" cp
          ON cp."conversationId" = m."conversationId"
        WHERE cp."userId" = ${viewer.id}
          AND m."conversationId" IN (${Prisma.join(conversationIds)})
          AND m."senderId" <> ${viewer.id}
          AND m."deletedAt" IS NULL
          AND (m."expiresAt" IS NULL OR m."expiresAt" > NOW())
          AND m."createdAt" > cp."lastReadAt"
        GROUP BY m."conversationId"
      `);
      if (logDb) {
        logDb("message.unreadCounts", performance.now() - unreadStart);
      }
    }

    const unreadMap = new Map(
      unreadRows.map((row) => [row.conversationId, row.count])
    );

    const resolveContent = (message: LastMessageRow, encryptionMode: "CLOUD" | "E2E") => {
      if (encryptionMode === "E2E") {
        return message.contentCiphertext ?? "Encrypted message";
      }
      if (message.contentCiphertext && message.contentIv && message.contentTag) {
        const decrypted = decryptText({
          ciphertext: message.contentCiphertext,
          iv: message.contentIv,
          tag: message.contentTag,
          keyId: message.contentKeyId,
          dekWrapped: message.contentDekWrapped ?? undefined,
          dekIv: message.contentDekIv ?? undefined,
          dekTag: message.contentDekTag ?? undefined,
        });
        if (decrypted !== null) {
          return decrypted;
        }
      }
      return message.content ?? "Encrypted message";
    };

    const payload = {
      data: sliced.map((item) => {
        const participant = item.conversation.participants[0]?.user ?? null;
        const lastMessage =
          item.conversation.lastMessageId &&
          lastMessageMap.get(item.conversation.lastMessageId);

        return {
          id: item.conversationId,
          encryptionMode: item.conversation.encryptionMode,
          participant: participant
            ? {
                username: participant.username,
                displayName: participant.displayName,
                image: participant.image,
              }
            : null,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: resolveContent(lastMessage, item.conversation.encryptionMode),
                createdAt: lastMessage.createdAt,
                senderId: lastMessage.senderId,
              }
            : null,
          lastMessageAt: item.conversation.lastMessageAt,
          unreadCount: unreadMap.get(item.conversationId) ?? 0,
        };
      }),
      nextCursor,
    };

    if (ALLOW_PLAINTEXT_DM_CACHE) {
      const allCloud = sliced.every(
        (item) => item.conversation.encryptionMode === "CLOUD"
      );
      if (allCloud) {
        await this.cache.set(cacheKey, payload, INBOX_CACHE_TTL_MS);
      }
    }

    return { ok: true, payload, cacheKey, cached: false };
  }
}
