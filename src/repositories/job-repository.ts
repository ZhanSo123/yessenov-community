import { Prisma, type JobStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type JobRecord = {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  status: JobStatus;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class JobRepository {
  async create(args: Prisma.JobCreateArgs) {
    return prisma.job.create(args);
  }

  async claimNext(params: { workerId: string; lockTtlMs: number }) {
    const lockCutoff = new Date(Date.now() - params.lockTtlMs);

    const rows = await prisma.$queryRaw<JobRecord[]>(Prisma.sql`
      UPDATE "Job"
      SET "status" = 'RUNNING',
          "lockedAt" = NOW(),
          "lockedBy" = ${params.workerId},
          "attempts" = "attempts" + 1,
          "lastError" = NULL,
          "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id"
        FROM "Job"
        WHERE (
          ("status" = 'PENDING' AND "runAt" <= NOW())
          OR ("status" = 'RUNNING' AND "lockedAt" IS NOT NULL AND "lockedAt" < ${lockCutoff})
        )
        ORDER BY "runAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `);

    return rows[0] ?? null;
  }

  async markDone(jobId: string) {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async reschedule(jobId: string, params: { runAt: Date; lastError?: string }) {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: "PENDING",
        runAt: params.runAt,
        lockedAt: null,
        lockedBy: null,
        lastError: params.lastError ?? null,
      },
    });
  }

  async markFailed(jobId: string, params: { lastError?: string }) {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        lockedAt: null,
        lockedBy: null,
        lastError: params.lastError ?? null,
      },
    });
  }

  async createLog(args: Prisma.JobLogCreateArgs) {
    return prisma.jobLog.create(args);
  }
}
