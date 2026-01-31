import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { getOptionalUser, requireRoleApi } from "@/lib/auth";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getAccessibleCommunityIds } from "@/lib/community-access";
import { prisma } from "@/lib/prisma";
import { CommunityCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "accessible";

    const viewer = await getOptionalUser();
    if (scope === "open") {
      const cacheKey = "communities:open";
      const cached = await cacheGet<unknown[]>(cacheKey);
      if (cached) {
        return apiSuccess({ data: cached });
      }
      const communities = await prisma.community.findMany({
        where: { type: "OPEN", isPrivate: false },
        orderBy: { createdAt: "desc" },
      });
      await cacheSet(cacheKey, communities, 60 * 1000);
      return apiSuccess({ data: communities });
    }

    if (scope === "recommended") {
      if (!viewer) {
        return apiSuccess({ data: [] });
      }

      const accessibleIds = await getAccessibleCommunityIds({
        id: viewer.id,
        role: viewer.role,
        faculty: viewer.faculty ?? null,
        course: viewer.course ?? null,
      });

      const interestTerms = (viewer.interests ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6);

      const facultyCode = viewer.faculty?.trim().toUpperCase() ?? "";
      const courseYear = viewer.course ?? null;

      const orFilters = [];

      interestTerms.forEach((term) => {
        orFilters.push(
          { title: { contains: term, mode: "insensitive" as const } },
          { description: { contains: term, mode: "insensitive" as const } },
          { slug: { contains: term, mode: "insensitive" as const } }
        );
      });

      if (facultyCode) {
        orFilters.push({ type: "FACULTY", facultyCode });
      }

      if (courseYear) {
        orFilters.push({
          type: "COURSE",
          courseYear,
          ...(facultyCode ? { facultyCode } : {}),
        });
      }

      if (orFilters.length === 0) {
        return apiSuccess({ data: [] });
      }

      const where =
        accessibleIds === null
          ? { OR: orFilters }
          : { id: { in: accessibleIds }, OR: orFilters };

      const communities = await prisma.community.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 12,
      });

      return apiSuccess({ data: communities });
    }

    const accessibleIds = await getAccessibleCommunityIds(
      viewer
        ? {
            id: viewer.id,
            role: viewer.role,
            faculty: viewer.faculty ?? null,
            course: viewer.course ?? null,
          }
        : null
    );

    const communities = await prisma.community.findMany({
      where:
        accessibleIds === null
          ? undefined
          : { id: { in: accessibleIds } },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({ data: communities });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleApi("ADMIN");
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

    const existing = await prisma.community.findUnique({
      where: { slug: parsed.data.slug },
    });

    if (existing) {
      return apiError("BAD_REQUEST", 400);
    }

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

    return apiSuccess({ data: community }, { status: 201 });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
