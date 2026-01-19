import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

const communitySchema = z.object({
  slug: z.string().min(1).max(64),
  title: z.string().min(1).max(128),
  description: z.string().optional().default(""),
});

export async function GET() {
  try {
    const communities = await prisma.community.findMany({
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess({ data: communities });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = communitySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const { slug, title, description } = parsed.data;

    const existing = await prisma.community.findUnique({
      where: { slug },
    });

    if (existing) {
      return apiError("BAD_REQUEST", 400);
    }

    const community = await prisma.community.create({
      data: {
        slug,
        title,
        description: description ?? "",
      },
    });

    return apiSuccess({ data: community }, { status: 201 });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
