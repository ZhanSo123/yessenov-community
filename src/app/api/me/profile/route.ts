import { NextRequest } from "next/server";

import { auth } from "@/auth";
import { apiError, apiSuccess } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { validateProfile } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError("UNAUTHORIZED", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        image: true,
        interests: true,
        hasOnboarded: true,
        faculty: true,
        course: true,
      },
    });

    if (!user) {
      return apiError("UNAUTHORIZED", 401);
    }

    return apiSuccess({
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          image: user.image,
          interests: user.interests,
          hasOnboarded: user.hasOnboarded,
          faculty: user.faculty,
          course: user.course,
        },
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const session = await auth();
    if (!session?.user?.id) {
      return apiError("UNAUTHORIZED", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        username: true,
        usernameLower: true,
        hasOnboarded: true,
        role: true,
        faculty: true,
        course: true,
        interests: true,
      },
    });

    if (!user) {
      return apiError("UNAUTHORIZED", 401);
    }

    const validated = validateProfile(body);
    if (!validated.ok) {
      return apiError("BAD_REQUEST", 400, { message: validated.error.code });
    }

    if (
      user.username &&
      user.hasOnboarded &&
      user.usernameLower &&
      user.usernameLower !== validated.data.usernameLower
    ) {
      return apiError("BAD_REQUEST", 400, { message: "USERNAME_LOCKED" });
    }

    const existing = await prisma.user.findUnique({
      where: { usernameLower: validated.data.usernameLower },
      select: { id: true },
    });

    if (existing && existing.id !== user.id) {
      return apiError("CONFLICT", 409, { message: "USERNAME_TAKEN" });
    }

    const updateData: Record<string, unknown> = {
      username: validated.data.username,
      usernameLower: validated.data.usernameLower,
      displayName: validated.data.displayName,
      bio: validated.data.bio,
      image: validated.data.image,
      hasOnboarded: true,
    };

    if (validated.data.faculty !== undefined) {
      updateData.faculty = validated.data.faculty;
    }
    if (validated.data.course !== undefined) {
      updateData.course = validated.data.course;
    }
    if (validated.data.interests !== undefined) {
      updateData.interests = validated.data.interests;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        username: true,
        displayName: true,
        bio: true,
        image: true,
        faculty: true,
        course: true,
        interests: true,
      },
    });

    const shouldSyncCommunities =
      validated.data.faculty !== undefined || validated.data.course !== undefined;

    if (shouldSyncCommunities) {
      const facultyValue =
        validated.data.faculty !== undefined ? validated.data.faculty : user.faculty;
      const courseValue =
        validated.data.course !== undefined ? validated.data.course : user.course;
      const facultyCode = facultyValue ? facultyValue.trim().toUpperCase() : null;

      const orFilters = [];

      if (facultyCode) {
        orFilters.push({
          type: "FACULTY",
          isPrivate: true,
          facultyCode,
        });
      }

      if (courseValue) {
        if (facultyCode) {
          orFilters.push({
            type: "COURSE",
            isPrivate: true,
            courseYear: courseValue,
            facultyCode,
          });
          orFilters.push({
            type: "COURSE",
            isPrivate: true,
            courseYear: courseValue,
            facultyCode: null,
          });
        } else {
          orFilters.push({
            type: "COURSE",
            isPrivate: true,
            courseYear: courseValue,
          });
        }
      }

      if (user.role === "TEACHER") {
        orFilters.push({ type: "TEACHERS", isPrivate: true });
      }

      if (orFilters.length > 0) {
        const communities = await prisma.community.findMany({
          where: { OR: orFilters },
          select: { id: true },
        });

        if (communities.length > 0) {
          await prisma.communityMember.createMany({
            data: communities.map((community) => ({
              communityId: community.id,
              userId: user.id,
              role: "MEMBER",
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    return apiSuccess({ data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
