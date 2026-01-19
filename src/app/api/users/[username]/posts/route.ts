import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getOptionalUser } from "@/lib/auth";
import { buildCursor, parseCursor } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { PaginationSchema } from "@/lib/validators";

const DEFAULT_LIMIT = 20;

export async function GET(
  request: Request,
  { params }: { params: { username: string } }
) {
  try {
    const usernameLower = params.username.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { usernameLower },
      select: { id: true },
    });

    if (!user) {
      return apiError("NOT_FOUND", 404);
    }

    const { searchParams } = new URL(request.url);
    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursor(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const viewer = await getOptionalUser();
    const viewerId = viewer?.id ?? null;
    const viewerCanModerate = viewer ? canModerate(viewer) : false;

    const cursorFilter = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const visibilityFilter =
      viewerCanModerate || viewerId === user.id
        ? {}
        : { deletedAt: null, author: { shadowBannedAt: null } };

    const posts = await prisma.post.findMany({
      where: {
        authorId: user.id,
        replyToId: null,
        ...visibilityFilter,
        ...cursorFilter,
      },
      orderBy: [
        { createdAt: "desc" as const },
        { id: "desc" as const },
      ],
      take: limit + 1,
      include: {
        author: { select: { id: true, username: true, name: true, image: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;

    const likedSet = viewerId
      ? new Set(
          (
            await prisma.like.findMany({
              where: { userId: viewerId, postId: { in: sliced.map((p) => p.id) } },
              select: { postId: true },
            })
          ).map((like) => like.postId)
        )
      : new Set<number>();

    const nextCursor = hasMore
      ? buildCursor(sliced[sliced.length - 1].createdAt, sliced[sliced.length - 1].id)
      : null;

    return apiSuccess({
      data: sliced.map((post) => ({
        ...post,
        viewerHasLiked: likedSet.has(post.id),
        canViewDeleted: true,
      })),
      nextCursor,
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
