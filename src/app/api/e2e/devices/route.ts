import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireOnboardedUserApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { E2eDeviceSchema } from "@/lib/validators";
import { E2eDeviceService } from "@/services/e2e-device-service";
import { E2eDeviceListService } from "@/services/e2e-device-list-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const me = await requireOnboardedUserApi();
    const allowed = await rateLimit(request, `e2e:${me.id}:devices:list`);
    if (!allowed) {
      return apiError("TOO_MANY_REQUESTS", 429);
    }
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() ?? "";
    const username = searchParams.get("username")?.trim() ?? "";
    if (!userId && !username) {
      return apiError("BAD_REQUEST", 400);
    }

    let resolvedUserId = userId;
    if (!resolvedUserId && username) {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!user) {
        return apiError("NOT_FOUND", 404);
      }
      resolvedUserId = user.id;
    }

    const service = new E2eDeviceListService();
    const result = await service.listDevices({ userId: resolvedUserId });
    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await requireOnboardedUserApi();
    const allowed = await rateLimit(request, `e2e:${me.id}:devices:register`);
    if (!allowed) {
      return apiError("TOO_MANY_REQUESTS", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = E2eDeviceSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new E2eDeviceService();
    const result = await service.registerDevice({
      userId: me.id,
      deviceLabel: parsed.data.deviceLabel ?? null,
      identityKey: parsed.data.identityKey,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
