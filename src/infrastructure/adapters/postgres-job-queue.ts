import type { Job, JobHandler, JobQueue } from "@/domain/contracts";

import { JobRepository } from "@/repositories/job-repository";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_TTL_MS = 2 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

export class PostgresJobWorker {
  private running = false;

  constructor(
    private readonly handlers: Map<string, JobHandler>,
    private readonly repo = new JobRepository(),
    private readonly workerId = `worker-${crypto.randomUUID()}`,
    private readonly lockTtlMs = DEFAULT_LOCK_TTL_MS,
    private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    private readonly baseBackoffMs = DEFAULT_BACKOFF_MS,
    private readonly maxBackoffMs = MAX_BACKOFF_MS
  ) {}

  async start() {
    this.running = true;
    while (this.running) {
      const didWork = await this.processNext();
      if (!didWork) {
        await sleep(this.pollIntervalMs);
      }
    }
  }

  stop() {
    this.running = false;
  }

  private async processNext() {
    const job = await this.repo.claimNext({
      workerId: this.workerId,
      lockTtlMs: this.lockTtlMs,
    });

    if (!job) {
      return false;
    }

    const handler = this.handlers.get(job.type);
    if (!handler) {
      const message = `No handler registered for ${job.type}`;
      await this.repo.markFailed(job.id, { lastError: message });
      await this.repo.createLog({
        data: { jobId: job.id, status: "FAILED", message },
      });
      return true;
    }

    const domainJob: Job = {
      type: job.type,
      enqueuedAt: job.createdAt,
      payload: job.payload as Record<string, unknown>,
      runAt: job.runAt,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    };

    try {
      await handler(domainJob);
      await this.repo.markDone(job.id);
      await this.repo.createLog({
        data: { jobId: job.id, status: "DONE" },
      });
      return true;
    } catch (error) {
      const lastError = formatError(error);
      const attempts = job.attempts;
      const maxAttempts = job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

      if (attempts >= maxAttempts) {
        await this.repo.markFailed(job.id, { lastError });
        await this.repo.createLog({
          data: { jobId: job.id, status: "FAILED", message: lastError },
        });
        return true;
      }

      const delayMs = Math.min(
        this.maxBackoffMs,
        this.baseBackoffMs * Math.pow(2, Math.max(0, attempts - 1))
      );
      const runAt = new Date(Date.now() + delayMs);
      await this.repo.reschedule(job.id, { runAt, lastError });
      await this.repo.createLog({
        data: { jobId: job.id, status: "PENDING", message: lastError },
      });
      return true;
    }
  }
}

export class PostgresJobQueue implements JobQueue {
  private handlers = new Map<string, JobHandler>();

  constructor(private readonly repo = new JobRepository()) {}

  register<TPayload extends Record<string, unknown>>(
    type: string,
    handler: JobHandler<TPayload>
  ) {
    this.handlers.set(type, handler as JobHandler);
  }

  async enqueue<TPayload extends Record<string, unknown>>(job: Job<TPayload>) {
    const runAt = job.runAt ?? new Date();
    const maxAttempts = job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    await this.repo.create({
      data: {
        type: job.type,
        payload: job.payload ?? {},
        runAt,
        maxAttempts,
      },
    });
  }

  createWorker(options?: {
    workerId?: string;
    lockTtlMs?: number;
    pollIntervalMs?: number;
    baseBackoffMs?: number;
    maxBackoffMs?: number;
  }) {
    return new PostgresJobWorker(
      this.handlers,
      this.repo,
      options?.workerId ?? `worker-${crypto.randomUUID()}`,
      options?.lockTtlMs ?? DEFAULT_LOCK_TTL_MS,
      options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      options?.baseBackoffMs ?? DEFAULT_BACKOFF_MS,
      options?.maxBackoffMs ?? MAX_BACKOFF_MS
    );
  }
}
