import { headers } from "next/headers";

import { auth } from "@/auth";

export async function GET() {
  const host = headers().get("host");
  const nextAuthUrlHost = process.env.NEXTAUTH_URL
    ? new URL(process.env.NEXTAUTH_URL).host
    : null;
  const mismatch = Boolean(
    host && nextAuthUrlHost && host.toLowerCase() !== nextAuthUrlHost.toLowerCase()
  );
  if (mismatch) {
    console.warn(
      `Host mismatch: request host "${host}" vs NEXTAUTH_URL "${nextAuthUrlHost}".`
    );
  }
  const session = await auth();
  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role,
      }
    : null;
  return Response.json({
    hasSession: Boolean(session),
    user,
    host,
    nextAuthUrlHost,
    mismatch,
  });
}
