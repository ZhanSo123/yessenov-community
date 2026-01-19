import { apiError, apiSuccess } from "@/lib/api-errors";
import { ensureInviteAccepted, requireUserApi } from "@/lib/auth";
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
    ensureInviteAccepted(user);
    const username = parsed.data.username.trim();
    const usernameLower = username.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { usernameLower },
      select: { id: true },
    });

    if (existing && existing.id !== user.id) {
      return apiError("CONFLICT", 409);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        username,
        usernameLower,
        age: parsed.data.age ?? null,
        bio: parsed.data.bio ?? null,
        hasOnboarded: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        age: true,
        bio: true,
      },
    });

    return apiSuccess({ ok: true, user: updated });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
