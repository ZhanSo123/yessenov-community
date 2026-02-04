import { PrismaClient } from "@prisma/client";

import { getApiMetricsStore } from "@/lib/api-metrics";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaMiddlewareAttached?: boolean;
};

const createClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
  });

const attachMetrics = (client: PrismaClient) => {
  const storeMetrics = () => {
    const store = getApiMetricsStore();
    if (store) {
      store.dbQueryCount += 1;
    }
  };

  const maybeUse = (client as unknown as { $use?: Function }).$use;
  if (typeof maybeUse === "function") {
    maybeUse.call(client, async (params: unknown, next: (args: unknown) => unknown) => {
      storeMetrics();
      return next(params);
    });
    return client;
  }

  const maybeExtends = (client as unknown as { $extends?: Function }).$extends;
  if (typeof maybeExtends === "function") {
    return maybeExtends.call(client, {
      query: {
        $allModels: {
          $allOperations({
            args,
            query,
          }: {
            args: unknown;
            query: (args: unknown) => unknown;
          }) {
            storeMetrics();
            return query(args);
          },
        },
      },
    }) as PrismaClient;
  }

  return client;
};

let prisma = globalForPrisma.prisma ?? createClient();

if (!globalForPrisma.prismaMiddlewareAttached) {
  prisma = attachMetrics(prisma);
  globalForPrisma.prismaMiddlewareAttached = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
