import { type Prisma } from "@prisma/client";

import { canModerate, type Role } from "@/lib/auth";
import { getInfrastructure } from "@/infrastructure";
import { CommunityMemberRepository } from "@/repositories/community-member-repository";
import { CommunityRepository } from "@/repositories/community-repository";

type ViewerContext = {
  id: string;
  role: Role;
  faculty: string | null;
  course: number | null;
};

type CommunityAccessInput = {
  id: number;
  type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
  isPrivate: boolean;
  facultyCode: string | null;
  courseYear: number | null;
};

const normalizeFaculty = (value: string | null | undefined) =>
  value ? value.trim().toUpperCase() : null;

const ACCESS_CACHE_TTL_MS = 60 * 1000;

const communityRepo = new CommunityRepository();
const communityMemberRepo = new CommunityMemberRepository();
const cache = getInfrastructure().cache;

export const getAccessibleCommunityIds = async (
  viewer: ViewerContext | null
) => {
  if (!viewer) {
    const cacheKey = "community-access:anon";
    const cached = await cache.get<{ ids: number[] }>(cacheKey);
    if (cached) {
      return cached.ids;
    }
    const open = await communityRepo.findMany({
      where: { type: "OPEN", isPrivate: false },
      select: { id: true },
    });
    const ids = open.map((community) => community.id);
    await cache.set(cacheKey, { ids }, ACCESS_CACHE_TTL_MS);
    return ids;
  }

  if (canModerate(viewer)) {
    return null;
  }

  const facultyCode = normalizeFaculty(viewer.faculty);
  const cacheKey = `community-access:${viewer.id}:${viewer.role}:${facultyCode ?? "none"}:${viewer.course ?? "none"}`;
  const cached = await cache.get<{ ids: number[] }>(cacheKey);
  if (cached) {
    return cached.ids;
  }

  const memberIds = (
    await communityMemberRepo.findMany({
      where: { userId: viewer.id },
      select: { communityId: true },
    })
  ).map((entry) => entry.communityId);

  const orFilters: Prisma.CommunityWhereInput[] = [];

  if (memberIds.length > 0) {
    orFilters.push({ id: { in: memberIds } });
  }

  orFilters.push({ type: "OPEN", isPrivate: false });

  if (viewer.role === "TEACHER") {
    orFilters.push({ type: "TEACHERS" });
    orFilters.push({ type: "FACULTY", isPrivate: false });
    orFilters.push({ type: "COURSE", isPrivate: false });
  } else {
    if (facultyCode) {
      orFilters.push({
        type: "FACULTY",
        facultyCode,
        isPrivate: false,
      });
    }
    if (viewer.course) {
      orFilters.push({
        type: "COURSE",
        courseYear: viewer.course,
        ...(facultyCode ? { facultyCode } : {}),
        isPrivate: false,
      });
    }
  }

  const communities = await communityRepo.findMany({
    where: { OR: orFilters },
    select: { id: true },
  });

  const ids = Array.from(new Set(communities.map((community) => community.id)));
  await cache.set(cacheKey, { ids }, ACCESS_CACHE_TTL_MS);
  return ids;
};

export const canAccessCommunity = async (
  community: CommunityAccessInput,
  viewer: ViewerContext | null
) => {
  if (viewer && canModerate(viewer)) {
    return true;
  }

  if (community.type === "TEACHERS") {
    return Boolean(viewer && viewer.role === "TEACHER");
  }

  if (!viewer) {
    return community.type === "OPEN" && !community.isPrivate;
  }

  if (community.type === "OPEN" && !community.isPrivate) {
    return true;
  }

  if (!community.isPrivate) {
    if (community.type === "FACULTY") {
      if (viewer.role === "TEACHER") {
        return true;
      }
      const facultyCode = normalizeFaculty(community.facultyCode);
      const viewerFaculty = normalizeFaculty(viewer.faculty);
      if (facultyCode && viewerFaculty && facultyCode === viewerFaculty) {
        return true;
      }
    }

    if (community.type === "COURSE") {
      if (viewer.role === "TEACHER") {
        return true;
      }
      const facultyCode = normalizeFaculty(community.facultyCode);
      const viewerFaculty = normalizeFaculty(viewer.faculty);
      const facultyMatch =
        !facultyCode || (viewerFaculty && facultyCode === viewerFaculty);
      if (viewer.course && community.courseYear && facultyMatch) {
        return viewer.course === community.courseYear;
      }
    }
  }

  const membership = await communityMemberRepo.findUnique({
    where: {
      communityId_userId: {
        communityId: community.id,
        userId: viewer.id,
      },
    },
    select: { id: true },
  });

  return Boolean(membership);
};
