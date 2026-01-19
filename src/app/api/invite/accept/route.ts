import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const inviteOnly = process.env.INVITE_ONLY === "true";
    if (!inviteOnly) {
      const user = await requireUserApi();
      return apiSuccess({ ok: true, userId: user.id });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const code = String((body as { code?: string }).code ?? "").trim();
    if (!code) {
      return apiError("BAD_REQUEST", 400);
    }

    const allowedCodes = (process.env.INVITE_CODES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!allowedCodes.includes(code)) {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireUserApi();
    if (user.role === "MOD" || user.role === "ADMIN") {
      return apiSuccess({ ok: true, userId: user.id });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { inviteAcceptedAt: new Date() },
    });

    return apiSuccess({ ok: true, userId: user.id });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
