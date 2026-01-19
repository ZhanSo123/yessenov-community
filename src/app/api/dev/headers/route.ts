import { headers } from "next/headers";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const host = headers().get("host");
  const cookieHeader = headers().get("cookie") ?? "";
  const cookieNames = cookieHeader
    .split(";")
    .map((pair) => pair.trim().split("=")[0])
    .filter(Boolean);

  return Response.json({
    host,
    cookieHeaderPresent: Boolean(cookieHeader),
    cookieNames,
  });
}
