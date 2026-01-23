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
        hasOnboarded: true,
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
          hasOnboarded: user.hasOnboarded,
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
      select: { id: true, username: true, usernameLower: true, hasOnboarded: true },
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

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: validated.data.username,
        usernameLower: validated.data.usernameLower,
        displayName: validated.data.displayName,
        bio: validated.data.bio,
        hasOnboarded: true,
      },
      select: {
        username: true,
        displayName: true,
        bio: true,
      },
    });

    return apiSuccess({ data: updated });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
