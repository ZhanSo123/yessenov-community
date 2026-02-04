import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

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

export type SearchUsersResult =
  | {
      ok: true;
      payload: {
        items: Array<{
          id: string;
          username: string | null;
          displayName: string | null;
          image: string | null;
          counts: { followers: number };
          viewer: { isFollowing: boolean; isFriend: boolean; isMe: boolean };
        }>;
        nextCursor: string | null;
      };
    }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

export class UserSearchService {
  async searchUsers(params: {
    query: string;
    limit?: number | null;
    cursor?: string | null;
    viewerId: string | null;
  }): Promise<SearchUsersResult> {
    const { viewerId } = params;
    let q = params.query.trim();
    if (q.startsWith("@")) {
      q = q.slice(1);
    }
    q = q.trim().toLowerCase();

    if (!q || q.startsWith("%")) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const cursor = parseCursor(params.cursor ?? null);
    if (params.cursor && !cursor) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

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

    return {
      ok: true,
      payload: {
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
      },
    };
  }
}
