import { headers } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  const requestHeaders = await headers();

  return Response.json({
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    node: process.version,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    host: requestHeaders.get("host"),
  });
}
