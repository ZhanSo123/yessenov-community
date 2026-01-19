import { headers } from "next/headers";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const cookieHeader = requestHeaders.get("cookie") ?? "";
  const cookieNames = cookieHeader
    .split(";")
    .map((pair: string) => pair.trim().split("=")[0])
    .filter(Boolean);

  return Response.json({
    host,
    cookieHeaderPresent: Boolean(cookieHeader),
    cookieNames,
  });
}
