import { NextRequest } from "next/server";
import bcrypt from "bcrypt";

import { apiError, apiSuccess } from "@/lib/api-errors";
import { checkActivityLimit } from "@/lib/abuse-tracker";
import { getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { PhoneVerifySchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = PhoneVerifySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const ip = getClientIp(request);
    const rate = checkActivityLimit(`auth:phone:verify:${ip}`, 60_000, 10);
    if (!rate.allowed) {
      return apiError("RATE_LIMIT", 429);
    }

    const otp = await prisma.phoneOtp.findFirst({
      where: {
        phoneE164: parsed.data.phoneE164,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return apiError("UNAUTHORIZED", 401);
    }

    if (otp.attempts >= 5) {
      return apiError("FORBIDDEN", 403);
    }

    const isValid = await bcrypt.compare(parsed.data.code, otp.codeHash);

    await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: {
        attempts: otp.attempts + 1,
        consumedAt: isValid ? new Date() : null,
      },
    });

    if (!isValid) {
      return apiError("UNAUTHORIZED", 401);
    }

    const sanitizedEmail = `phone_${parsed.data.phoneE164.replace(
      /\D/g,
      ""
    )}@phone.local`;

    await prisma.user.upsert({
      where: { phoneE164: parsed.data.phoneE164 },
      update: {},
      create: {
        phoneE164: parsed.data.phoneE164,
        email: sanitizedEmail,
        hasOnboarded: false,
      },
    });

    // TODO: Wire Auth.js session for phone OTP once provider is added.
    return apiSuccess({ ok: true, todo: "wire session" });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
