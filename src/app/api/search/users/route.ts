import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { checkActivityLimit } from "@/lib/abuse-tracker";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rate-limit";
import { SearchUsersSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const SEARCH_RATE_WINDOW_MS = 10_000;
const SEARCH_RATE_MAX = 10;

type CursorData = {
  searchRank: number;
  friendSort: number;
  usernameLower: string;
  id: string;
};

type SearchRow = {
  id: string;
  username: string | null;
  usernameLower: string;
  displayName: string | null;
  image: string | null;
  followersCount: number | bigint | null;
  searchRank: number;
  friendSort: number;
  isFollowing: boolean;
  isFriend: boolean;
  isMe: boolean;
};

const parseCursor = (value: string | null | undefined): CursorData | null => {
  if (!value) {
    return null;
  }

  const parts = value.split("|");
  if (parts.length < 4) {
    return null;
  }

  const [rankPart, friendPart, usernameLower, ...idParts] = parts;
  const id = idParts.join("|");
  const searchRank = Number(rankPart);
  const friendSort = Number(friendPart);

  if (
    !Number.isFinite(searchRank) ||
    !Number.isFinite(friendSort) ||
    !usernameLower ||
    !id
  ) {
    return null;
  }

  return { searchRank, friendSort, usernameLower, id };
};

const buildCursor = (data: CursorData) =>
  `${data.searchRank}|${data.friendSort}|${data.usernameLower}|${data.id}`;

const coerceCount = (value: SearchRow["followersCount"]) => {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  return 0;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = SearchUsersSchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    let q = parsed.data.q.trim();
    if (q.startsWith("@")) {
      q = q.slice(1);
    }
    q = q.trim().toLowerCase();

    if (!q || q.startsWith("%")) {
      return apiError("BAD_REQUEST", 400);
    }

    const cursor = parseCursor(parsed.data.cursor);
    if (parsed.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = Math.min(parsed.data.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;

    const activity = checkActivityLimit(
      viewerId ? `search:${viewerId}` : `search:${getClientIp(request)}`,
      SEARCH_RATE_WINDOW_MS,
      SEARCH_RATE_MAX
    );
    if (!activity.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const qLike = `${q}%`;
    const nameLike = `%${q}%`;
    const cursorFilter = cursor
      ? Prisma.sql`WHERE ("searchRank", "friendSort", "usernameLower", id) > (${cursor.searchRank}, ${cursor.friendSort}, ${cursor.usernameLower}, ${cursor.id})`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT
          u.id,
          u.username,
          u."usernameLower" AS "usernameLower",
          u."displayName" AS "displayName",
          u.image,
          (SELECT COUNT(*)::int FROM "Follow" f WHERE f."followingId" = u.id) AS "followersCount",
          CASE
            WHEN u."usernameLower" = ${q} THEN 0
            WHEN u."usernameLower" LIKE ${qLike} THEN 1
            ELSE 2
          END AS "searchRank",
          CASE
            WHEN f1.id IS NOT NULL AND f2.id IS NOT NULL THEN 0
            ELSE 1
          END AS "friendSort",
          CASE WHEN f1.id IS NOT NULL THEN true ELSE false END AS "isFollowing",
          CASE WHEN f1.id IS NOT NULL AND f2.id IS NOT NULL THEN true ELSE false END AS "isFriend",
          CASE WHEN ${viewerId} IS NOT NULL AND u.id = ${viewerId} THEN true ELSE false END AS "isMe"
        FROM "User" u
        LEFT JOIN "Follow" f1
          ON f1."followerId" = ${viewerId} AND f1."followingId" = u.id
        LEFT JOIN "Follow" f2
          ON f2."followerId" = u.id AND f2."followingId" = ${viewerId}
        WHERE u."usernameLower" IS NOT NULL
          AND (
            u."usernameLower" LIKE ${qLike}
            OR u."displayName" ILIKE ${nameLike}
          )
      )
      SELECT *
      FROM candidates
      ${cursorFilter}
      ORDER BY "searchRank" ASC, "friendSort" ASC, "usernameLower" ASC, id ASC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? buildCursor({
          searchRank: sliced[sliced.length - 1].searchRank,
          friendSort: sliced[sliced.length - 1].friendSort,
          usernameLower: sliced[sliced.length - 1].usernameLower,
          id: sliced[sliced.length - 1].id,
        })
      : null;

    return apiSuccess({
      items: sliced.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        image: row.image,
        counts: {
          followers: coerceCount(row.followersCount),
        },
        viewer: {
          isFollowing: row.isFollowing,
          isFriend: row.isFriend,
          isMe: row.isMe,
        },
      })),
      nextCursor,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
