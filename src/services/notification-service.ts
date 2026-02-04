import { buildCursorString } from "@/lib/pagination";
import { getInfrastructure } from "@/infrastructure";
import { NotificationRepository } from "@/repositories/notification-repository";

export type NotificationListResult = {
  payload: { data: unknown[]; nextCursor: string | null };
  cacheKey: string;
  cached: boolean;
};

const DEFAULT_LIMIT = 20;
const NOTIFICATIONS_CACHE_TTL_MS = 12 * 1000;
const UNREAD_CACHE_TTL_MS = 8 * 1000;

export class NotificationService {
  constructor(
    private readonly notificationRepo = new NotificationRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async listNotifications(params: {
    userId: string;
    limit?: number | null;
    cursor: { createdAt: Date; id: string } | null;
  }): Promise<NotificationListResult> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cursor = params.cursor;

    const cacheKey = `notifications:list:${params.userId}:${limit}:${cursor?.createdAt?.toISOString() ?? "none"}:${cursor?.id ?? "none"}`;
    const cached = await this.cache.get<NotificationListResult["payload"]>(cacheKey);
    if (cached) {
      return { payload: cached, cacheKey, cached: true };
    }

    const cursorFilter = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const notifications = await this.notificationRepo.findMany({
      where: {
        userId: params.userId,
        ...cursorFilter,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            image: true,
          },
        },
        post: { select: { id: true } },
      },
    });

    const hasMore = notifications.length > limit;
    const sliced = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    const payload = { data: sliced, nextCursor };
    await this.cache.set(cacheKey, payload, NOTIFICATIONS_CACHE_TTL_MS);

    return { payload, cacheKey, cached: false };
  }

  async getUnreadCount(userId: string) {
    const cacheKey = `notifications:unread:${userId}`;
    const cached = await this.cache.get<{ data: { count: number } }>(cacheKey);
    if (cached) {
      return { payload: cached, cacheKey, cached: true };
    }

    const count = await this.notificationRepo.count({
      where: { userId, readAt: null },
    });

    const payload = { data: { count } };
    await this.cache.set(cacheKey, payload, UNREAD_CACHE_TTL_MS);
    return { payload, cacheKey, cached: false };
  }

  async markRead(userId: string, notificationId: string) {
    await this.notificationRepo.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    await this.cache.del(`notifications:unread:${userId}`);
    await this.cache.del(`notifications:list:${userId}:`);

    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.notificationRepo.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    await this.cache.del(`notifications:unread:${userId}`);
    await this.cache.del(`notifications:list:${userId}:`);

    return { ok: true };
  }
}
