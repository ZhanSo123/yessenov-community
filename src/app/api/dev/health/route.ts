import { prisma } from "@/lib/prisma";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  let prismaStatus: "ok" | "fail" = "ok";
  let dbStatus: "ok" | "fail" = "ok";

  try {
    await prisma.$connect();
  } catch {
    prismaStatus = "fail";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "fail";
  }

  return Response.json({
    prisma: prismaStatus,
    db: dbStatus,
    env: {
      googleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      nextauthUrl: Boolean(process.env.NEXTAUTH_URL),
    },
  });
}
