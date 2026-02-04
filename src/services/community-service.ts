import { type Prisma } from "@prisma/client";

import { type Role } from "@/lib/auth";
import { getAccessibleCommunityIds } from "@/lib/community-access";
import { getInfrastructure } from "@/infrastructure";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { CommunityRepository } from "@/repositories/community-repository";

export type CommunityViewer = {
  id: string;
  role: Role;
  faculty?: string | null;
  course?: number | null;
  interests?: string[] | null;
};

const BASE_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  type: true,
  isPrivate: true,
  facultyCode: true,
  courseYear: true,
} as const;

export type CommunityListResult = {
  payload: { data: unknown[] };
  cacheKey: string;
  cached: boolean;
};

export type CommunityCreateResult =
  | { ok: true; payload: { data: unknown } }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

export class CommunityService {
  constructor(
    private readonly communityRepo = new CommunityRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async listCommunities(params: {
    scope: string;
    viewer: CommunityViewer | null;
  }): Promise<CommunityListResult> {
    const { scope, viewer } = params;

    if (scope === "open") {
      const cacheKey = "communities:open:anon";
      const cached = await this.cache.get<unknown[]>(cacheKey);
      if (cached) {
        return { payload: { data: cached }, cacheKey, cached: true };
      }
      const communities = await this.communityRepo.findMany({
        where: { type: "OPEN", isPrivate: false },
        orderBy: { createdAt: "desc" },
        select: BASE_SELECT,
      });
      await this.cache.set(cacheKey, communities, 60 * 1000);
      return { payload: { data: communities }, cacheKey, cached: false };
    }

    if (scope === "recommended") {
      if (!viewer) {
        return { payload: { data: [] }, cacheKey: "", cached: false };
      }

      const recommendedKey = `communities:recommended:${viewer.id}:${viewer.role}:${viewer.faculty ?? "none"}:${viewer.course ?? "none"}:${(viewer.interests ?? []).join(",")}`;
      const recommendedCached = await this.cache.get<unknown[]>(recommendedKey);
      if (recommendedCached) {
        return {
          payload: { data: recommendedCached },
          cacheKey: recommendedKey,
          cached: true,
        };
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

      const orFilters: Prisma.CommunityWhereInput[] = [];

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
        return { payload: { data: [] }, cacheKey: recommendedKey, cached: false };
      }

      const where =
        accessibleIds === null
          ? { OR: orFilters }
          : { id: { in: accessibleIds }, OR: orFilters };

      const communities = await this.communityRepo.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 12,
        select: BASE_SELECT,
      });

      await this.cache.set(recommendedKey, communities, 30 * 1000);
      return { payload: { data: communities }, cacheKey: recommendedKey, cached: false };
    }

    const accessibleKey = `communities:accessible:${viewer?.id ?? "anon"}:${viewer?.role ?? "ANON"}:${viewer?.faculty ?? "none"}:${viewer?.course ?? "none"}`;
    const accessibleCached = await this.cache.get<unknown[]>(accessibleKey);
    if (accessibleCached) {
      return {
        payload: { data: accessibleCached },
        cacheKey: accessibleKey,
        cached: true,
      };
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

    const communities = await this.communityRepo.findMany({
      where: accessibleIds === null ? undefined : { id: { in: accessibleIds } },
      orderBy: { createdAt: "desc" },
      select: BASE_SELECT,
    });

    await this.cache.set(accessibleKey, communities, 30 * 1000);
    return { payload: { data: communities }, cacheKey: accessibleKey, cached: false };
  }

  async createCommunity(params: {
    adminId: string;
    data: {
      slug: string;
      title: string;
      description?: string | null;
      type?: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS" | null;
      isPrivate?: boolean | null;
      facultyCode?: string | null;
      courseYear?: number | null;
    };
  }): Promise<CommunityCreateResult> {
    const { data, adminId } = params;

    const type = data.type ?? "OPEN";
    const isPrivate = type === "TEACHERS" ? true : data.isPrivate ?? false;
    const facultyCode =
      type === "FACULTY" || type === "COURSE"
        ? data.facultyCode
          ? data.facultyCode.trim().toUpperCase()
          : null
        : null;
    const courseYear = type === "COURSE" ? data.courseYear ?? null : null;

    let community;
    try {
      community = await this.communityRepo.create({
        data: {
          slug: data.slug,
          title: data.title,
          description: data.description ?? "",
          type,
          isPrivate,
          facultyCode,
          courseYear,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          type: true,
          isPrivate: true,
          facultyCode: true,
          courseYear: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }
      throw error;
    }

    await this.cache.del("communities:");
    await this.cache.del("community-access:");

    return { ok: true, payload: { data: community } };
  }
}
