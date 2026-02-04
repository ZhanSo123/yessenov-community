import { performance } from "node:perf_hooks";
import { type Prisma } from "@prisma/client";

import { buildCursor } from "@/lib/pagination";
import { canModerate, type Role } from "@/lib/auth";
import { getInfrastructure } from "@/infrastructure";
import { PostRepository } from "@/repositories/post-repository";

export type FeedMode = "for-you" | "following";

export type FeedViewer = {
  id: string;
  role: Role;
  faculty?: string | null;
  course?: number | null;
};

export type FeedParams = {
  mode: FeedMode;
  viewer: FeedViewer | null;
  limit: number;
  cursor: { createdAt: Date; id: number } | null;
  interestTerms: string[];
  logDb?: (query: string, ms: number) => void;
};

type FeedPost = {
  id: number;
  content: string;
  createdAt: Date;
  replyToId: number | null;
  deletedAt: Date | null;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    image: string | null;
  };
  _count: { likes: number; replies: number };
  viewerHasLiked: boolean;
  canViewDeleted: boolean;
};

export type FeedResult = {
  payload: { data: FeedPost[]; nextCursor: string | null };
  cacheKey: string;
  cached: boolean;
};

const FEED_CACHE_TTL_MS = 30 * 1000;

export class FeedService {
  constructor(
    private readonly postRepo = new PostRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async getFeed(params: FeedParams): Promise<FeedResult> {
    const { mode, viewer, limit, cursor, interestTerms, logDb } = params;
    const viewerId = viewer?.id ?? null;
    const viewerRole = viewer?.role ?? "ANON";
    const viewerCanModerate = viewer ? canModerate(viewer) : false;
    const cacheKey = `feed:${mode}:${viewerId ?? "anon"}:${viewerRole}:${limit}:${cursor?.createdAt?.toISOString() ?? "none"}:${cursor?.id ?? "none"}:${interestTerms.join(",") || "all"}`;

    const cached = await this.cache.get<{ posts: FeedPost[]; nextCursor: string | null }>(cacheKey);
    if (cached) {
      return {
        payload: { data: cached.posts, nextCursor: cached.nextCursor },
        cacheKey,
        cached: true,
      };
    }

    const baseWhere: Prisma.PostWhereInput = {
      replyToId: null,
      deletedAt: null,
    };
    const andFilters: Prisma.PostWhereInput[] = [];

    if (cursor) {
      andFilters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    if (!viewerCanModerate) {
      if (viewerId) {
        andFilters.push({
          OR: [
            { author: { shadowBannedAt: null } },
            { authorId: viewerId },
          ],
        });
      } else {
        baseWhere.author = { shadowBannedAt: null };
      }
    }

    andFilters.push({
      OR: [
        { communityId: null },
        { community: { type: "OPEN", isPrivate: false } },
      ],
    });

    if (andFilters.length > 0) {
      baseWhere.AND = andFilters;
    }

    if (interestTerms.length > 0) {
      const interestOr = interestTerms.flatMap((term) => [
        { content: { contains: term, mode: "insensitive" as const } },
        { community: { title: { contains: term, mode: "insensitive" as const } } },
        { community: { slug: { contains: term, mode: "insensitive" as const } } },
        {
          community: {
            description: { contains: term, mode: "insensitive" as const },
          },
        },
      ]);
      const interestFilter: Prisma.PostWhereInput = {
        OR: interestOr,
      };
      baseWhere.AND = baseWhere.AND
        ? [...(baseWhere.AND as Prisma.PostWhereInput[]), interestFilter]
        : [interestFilter];
    }

    const postSelect: Prisma.PostSelect = {
      id: true,
      content: true,
      createdAt: true,
      replyToId: true,
      deletedAt: true,
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          image: true,
        },
      },
      _count: { select: { likes: true, replies: true } },
      ...(viewerId
        ? {
            likes: {
              where: { userId: viewerId },
              select: { id: true },
            },
          }
        : {}),
    };

    const baseQuery = {
      where: baseWhere,
      orderBy: [
        { createdAt: "desc" as const },
        { id: "desc" as const },
      ],
      take: limit + 1,
      select: postSelect,
    };

    const queryStart = performance.now();

    const fetched =
      mode === "following"
        ? await this.postRepo.findMany({
            ...baseQuery,
            where: {
              ...baseWhere,
              author: { followers: { some: { followerId: viewerId ?? "" } } },
            },
          })
        : await this.postRepo.findMany(baseQuery);

    if (logDb) {
      logDb(
        mode === "following" ? "post.findMany.following" : "post.findMany.feed",
        performance.now() - queryStart
      );
    }

    const hasMore = fetched.length > limit;
    const sliced = hasMore ? fetched.slice(0, limit) : fetched;
    const nextCursor = hasMore
      ? buildCursor(
          sliced[sliced.length - 1].createdAt,
          sliced[sliced.length - 1].id
        )
      : null;

    const mapped = sliced.map((post) => {
      const { likes, ...rest } = post as typeof post & {
        likes?: Array<{ id: number }>;
      };
      return {
        ...rest,
        viewerHasLiked: Boolean(likes && likes.length > 0),
        canViewDeleted: true,
      } as FeedPost;
    });

    await this.cache.set(cacheKey, { posts: mapped, nextCursor }, FEED_CACHE_TTL_MS);

    return {
      payload: { data: mapped, nextCursor },
      cacheKey,
      cached: false,
    };
  }
}
