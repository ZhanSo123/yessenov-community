import { apiError, apiSuccess } from "@/lib/api-errors";
import { canModerate, getCommunityScope, requireRoleApi, requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CommunityCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);

    if (!canModerate(actor)) {
      const owned = (scope ?? []).filter((item) => item.role === "OWNER");
      if (owned.length === 0) {
        return apiError("FORBIDDEN", 403);
      }

      const communities = await prisma.community.findMany({
        where: { id: { in: owned.map((item) => item.communityId) } },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { posts: true, members: true } } },
      });

      return apiSuccess({ data: communities });
    }

    const communities = await prisma.community.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { posts: true, members: true } } },
    });

    return apiSuccess({ data: communities });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRoleApi("ADMIN");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = CommunityCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const type = parsed.data.type ?? "OPEN";
    const isPrivate =
      type === "TEACHERS" ? true : parsed.data.isPrivate ?? false;
    const facultyCode =
      type === "FACULTY" || type === "COURSE"
        ? parsed.data.facultyCode
          ? parsed.data.facultyCode.trim().toUpperCase()
          : null
        : null;
    const courseYear = type === "COURSE" ? parsed.data.courseYear ?? null : null;

    const community = await prisma.community.create({
      data: {
        slug: parsed.data.slug,
        title: parsed.data.title,
        description: parsed.data.description ?? "",
        type,
        isPrivate,
        facultyCode,
        courseYear,
      },
    });

    await prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId: actor.id,
        role: "OWNER",
      },
    }).catch(() => null);

    return apiSuccess({ data: community }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
