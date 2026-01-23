import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    if (!body || typeof body !== "object") {
      return apiError("BAD_REQUEST", 400);
    }

    const { id } = body as { id?: string };
    if (!id || typeof id !== "string") {
      return apiError("BAD_REQUEST", 400);
    }

    const user = await requireUserApi();

    await prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
