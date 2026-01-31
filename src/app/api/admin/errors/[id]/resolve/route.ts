import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const actor = await requireRoleApi("ADMIN");

    const target = await prisma.errorLog.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!target) {
      return apiError("NOT_FOUND", 404);
    }

    const updated = await prisma.errorLog.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: actor.id },
      select: {
        id: true,
        resolvedAt: true,
        resolvedById: true,
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
