import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

export async function GET() {
  const h = await headers();
  const c = (await cookies()).getAll().map((cookie) => cookie.name);

  return NextResponse.json({
    ok: true,
    host: h.get("host"),
    xfHost: h.get("x-forwarded-host"),
    xfProto: h.get("x-forwarded-proto"),
    cookieNames: c,
    hasAuthCookie: c.some(
      (name) =>
        name.includes("auth") ||
        name.includes("next") ||
        name.includes("Secure")
    ),
    nextAuthUrl: process.env.NEXTAUTH_URL ?? null,
    trustHost: process.env.AUTH_TRUST_HOST ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
