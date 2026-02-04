import { NextResponse } from "next/server";

import { DevLoginService } from "@/services/dev-login-service";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const service = new DevLoginService();
  const { sessionToken, expires } = await service.createSession();

  const response = NextResponse.json({ ok: true });
  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: false,
  });

  return response;
}
