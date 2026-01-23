import { PrismaClient } from "@prisma/client";

import { getApiMetricsStore } from "@/lib/api-metrics";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaMiddlewareAttached?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
  })


if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
