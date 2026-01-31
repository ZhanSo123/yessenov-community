import { prisma } from "@/lib/prisma";

type ErrorLogInput = {
  level?: "ERROR" | "WARN";
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  status?: number | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

const RETENTION_DAYS = 30;
let lastCleanupAt = 0;

const cleanupOldErrors = async () => {
  const now = Date.now();
  if (now - lastCleanupAt < 24 * 60 * 60 * 1000) {
    return;
  }
  lastCleanupAt = now;
  try {
    const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.errorLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  } catch {
    // Ignore cleanup failures.
  }
};

export const logError = async (input: ErrorLogInput) => {
  try {
    await cleanupOldErrors();
    await prisma.errorLog.create({
      data: {
        level: input.level ?? "ERROR",
        message: input.message,
        stack: input.stack ?? null,
        route: input.route ?? null,
        method: input.method ?? null,
        status: input.status ?? null,
        userId: input.userId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch {
    // Avoid recursive logging loops if DB is unavailable.
  }
};

export const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }
  return { message: typeof error === "string" ? error : "Unknown error", stack: null };
};
