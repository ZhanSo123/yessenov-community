import { z } from "zod";

import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-errors";
import {
  ensureNotBanned,
  requireOnboardedUserApi,
} from "@/lib/auth";
import { PostService } from "@/services/post-service";

export const runtime = "nodejs";

const repostSchema = z.object({
  repostOfId: z.number().int(),
});

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = repostSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const author = await requireOnboardedUserApi();
    ensureNotBanned(author);

    const service = new PostService();
    const result = await service.createRepost({
      repostOfId: parsed.data.repostOfId,
      author: {
        id: author.id,
        role: author.role,
        faculty: author.faculty ?? null,
        course: author.course ?? null,
        createdAt: author.createdAt,
        shadowBannedAt: author.shadowBannedAt,
        username: author.username,
        usernameLower: author.usernameLower,
      },
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
