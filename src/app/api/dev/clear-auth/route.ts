import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const response = NextResponse.json({ cleared: true });
  const cookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    "next-auth.state",
    "next-auth.nonce",
    "next-auth.pkce.code_verifier",
  ];

  cookieNames.forEach((name) => {
    response.cookies.set(name, "", { expires: new Date(0), path: "/" });
  });

  return response;
}
