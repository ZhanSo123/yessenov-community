import { cookies, headers } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const cookieNames = cookieStore.getAll().map((cookie) => cookie.name);
  const xfHost = requestHeaders.get("x-forwarded-host");
  const xfProto = requestHeaders.get("x-forwarded-proto");
  const host = requestHeaders.get("host");

  return Response.json({
    host,
    xfHost,
    xfProto,
    cookieNames,
    hasAuthCookies: cookieNames.some(
      (name) =>
        name.includes("authjs") ||
        name.includes("next-auth") ||
        name.includes("__Secure")
    ),
    nextauthUrl: process.env.NEXTAUTH_URL ?? null,
    trustHost: process.env.AUTH_TRUST_HOST ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
