import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { PaginationSchema } from "@/lib/validators";
import { AdminQueueService } from "@/services/admin-queue-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUserApi();

    const { searchParams } = new URL(request.url);
    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new AdminQueueService();
    const result = await service.getQueue({
      actor: { id: actor.id, role: actor.role },
      limit: pagination.data.limit ?? null,
      cursor: pagination.data.cursor ?? null,
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
