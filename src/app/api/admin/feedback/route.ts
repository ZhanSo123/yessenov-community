import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { parseCursorString } from "@/lib/pagination";
import { PaginationSchema } from "@/lib/validators";
import { FeedbackService } from "@/services/feedback-service";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("MOD");

    const { searchParams } = new URL(request.url);
    const pagination = PaginationSchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });

    if (!pagination.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const limit = pagination.data.limit ?? DEFAULT_LIMIT;
    const cursor = parseCursorString(pagination.data.cursor);

    if (pagination.data.cursor && !cursor) {
      return apiError("BAD_REQUEST", 400);
    }

    const service = new FeedbackService();
    const result = await service.listFeedback({ limit, cursor });

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
