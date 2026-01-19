import { NextRequest } from "next/server";
import bcrypt from "bcrypt";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { PhoneStartSchema } from "@/lib/validators";

const OTP_TTL_MS = 10 * 60_000;

const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = PhoneStartSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const ip = getClientIp(request);
    const rate = checkActivityLimit(`auth:phone:start:${ip}`, 60_000, 5);
    if (!rate.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.phoneOtp.create({
      data: {
        phoneE164: parsed.data.phoneE164,
        codeHash,
        expiresAt,
      },
    });

    return apiSuccess({
      ok: true,
      devCode: process.env.NODE_ENV === "development" ? code : undefined,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
