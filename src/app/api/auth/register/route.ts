import { NextRequest } from "next/server";
import bcrypt from "bcrypt";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { RegisterSchema } from "@/lib/validators";

const suggestUsername = (email: string, name?: string | null) => {
  const base = (name || email.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return base || "user";
};

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const email = parsed.data.email.toLowerCase();
    const ip = getClientIp(request);
    const ipLimit = checkActivityLimit(`auth:register:ip:${ip}`, 60_000, 5);
    const emailLimit = checkActivityLimit(
      `auth:register:email:${email}`,
      60_000,
      3
    );

    if (!ipLimit.allowed || !emailLimit.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existing) {
      return apiError("BAD_REQUEST", 400);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: parsed.data.name ?? null,
        hasOnboarded: false,
      },
    });

    return apiSuccess(
      {
        ok: true,
        suggestedUsername: suggestUsername(email, parsed.data.name),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
