import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { OnboardingSchema } from "@/lib/validators";

export async function POST(request: Request) {
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
    const username = parsed.data.username.toLowerCase();

    try {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          username,
          usernameLower: username,
          age: parsed.data.age ?? null,
          bio: parsed.data.bio ?? null,
          hasOnboarded: true,
        },
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
