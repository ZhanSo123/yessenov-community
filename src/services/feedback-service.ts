import { buildCursorString } from "@/lib/pagination";
import { FeedbackRepository } from "@/repositories/feedback-repository";

export type FeedbackCreateResult = { ok: true; payload: { data: unknown } };

export type FeedbackListResult = {
  payload: { data: unknown[]; nextCursor: string | null };
};

const DEFAULT_LIMIT = 100;

export class FeedbackService {
  constructor(private readonly feedbackRepo = new FeedbackRepository()) {}

  async createFeedback(params: {
    userId: string;
    message: string;
    currentPath?: string | null;
  }): Promise<FeedbackCreateResult> {
    const feedback = await this.feedbackRepo.create({
      data: {
        userId: params.userId,
        message: params.message,
        currentPath: params.currentPath ?? null,
      },
    });

    return { ok: true, payload: { data: feedback } };
  }

  async listFeedback(params: {
    limit?: number | null;
    cursor: { createdAt: Date; id: string } | null;
  }): Promise<FeedbackListResult> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const cursor = params.cursor;

    const filters = cursor
      ? [
          {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          },
        ]
      : [];

    const feedbackItems = await this.feedbackRepo.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        user: { select: { id: true, email: true, username: true, name: true } },
      },
    });

    const hasMore = feedbackItems.length > limit;
    const sliced = hasMore ? feedbackItems.slice(0, limit) : feedbackItems;
    const nextCursor = hasMore
      ? buildCursorString(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    return { payload: { data: sliced, nextCursor } };
  }
}
