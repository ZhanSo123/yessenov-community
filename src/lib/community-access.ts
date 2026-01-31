import { type Prisma } from "@prisma/client";

import { canModerate, type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export const getAccessibleCommunityIds = async (
  viewer: ViewerContext | null
) => {
  if (!viewer) {
    const open = await prisma.community.findMany({
      where: { type: "OPEN", isPrivate: false },
      select: { id: true },
    });
    return open.map((community) => community.id);
  }

  if (canModerate(viewer)) {
    return null;
  }

  const memberIds = (
    await prisma.communityMember.findMany({
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
    const facultyCode = normalizeFaculty(viewer.faculty);
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

  const communities = await prisma.community.findMany({
    where: { OR: orFilters },
    select: { id: true },
  });

  return Array.from(new Set(communities.map((community) => community.id)));
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

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId: community.id,
        userId: viewer.id,
      },
    },
    select: { id: true },
  });

  if (community.isPrivate) {
    return Boolean(membership);
  }

  if (community.type === "FACULTY") {
    if (viewer.role === "TEACHER") {
      return true;
    }
    const facultyCode = normalizeFaculty(community.facultyCode);
    const viewerFaculty = normalizeFaculty(viewer.faculty);
    if (facultyCode && viewerFaculty && facultyCode === viewerFaculty) {
      return true;
    }
    return Boolean(membership);
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
      return viewer.course === community.courseYear || Boolean(membership);
    }
    return Boolean(membership);
  }

  return true;
};
