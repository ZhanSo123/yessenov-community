import { prisma } from "@/lib/prisma";

export class DevHealthService {
  async check() {
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

    return {
      prisma: prismaStatus,
      db: dbStatus,
      env: {
        googleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
        nextauthUrl: Boolean(process.env.NEXTAUTH_URL),
      },
    };
  }
}
