import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const [userCount, accountCount, sessionCount] = await prisma.$transaction([
    prisma.user.count(),
    prisma.account.count(),
    prisma.session.count(),
  ]);

  const latestSession = await prisma.session.findFirst({
    orderBy: { expires: "desc" },
    select: { id: true, userId: true, expires: true },
  });

  return Response.json({
    counts: {
      users: userCount,
      accounts: accountCount,
      sessions: sessionCount,
    },
    latestSession,
  });
}
