import { type Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { OnboardingSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = OnboardingSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireUserApi();
    const username = parsed.data.username.trim().replace(/^@/, "").toLowerCase();
    if (!username) {
      return apiError("BAD_REQUEST", 400);
    }
    const faculty = parsed.data.faculty?.trim() ?? "";
    const bio = parsed.data.bio?.trim() ?? "";
    const image = parsed.data.image?.trim() ?? "";
    if (image && !image.startsWith("data:image/")) {
      return apiError("BAD_REQUEST", 400);
    }

    try {
      const data: Prisma.UserUpdateInput = {
        username,
        usernameLower: username,
        hasOnboarded: true,
      };
      if (parsed.data.age !== undefined) {
        data.age = parsed.data.age ?? null;
      }
      if (parsed.data.faculty !== undefined) {
        data.faculty = faculty || null;
      }
      if (parsed.data.course !== undefined) {
        data.course = parsed.data.course ?? null;
      }
      if (parsed.data.bio !== undefined) {
        data.bio = bio || null;
      }
      if (parsed.data.image !== undefined) {
        data.image = image || null;
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data,
      });

      return apiSuccess({ data: updated });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return apiError("BAD_REQUEST", 400);
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
