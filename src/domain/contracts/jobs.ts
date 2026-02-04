export type JobPayload = Record<string, unknown>;

export type Job<TPayload extends JobPayload = JobPayload> = {
  type: string;
  enqueuedAt: Date;
  payload: TPayload;
  runAt?: Date;
  attempts?: number;
  maxAttempts?: number;
};

export type JobHandler<TPayload extends JobPayload = JobPayload> = (
  job: Job<TPayload>
) => Promise<void> | void;

export interface JobQueue {
  enqueue<TPayload extends JobPayload>(job: Job<TPayload>): Promise<void>;
  register<TPayload extends JobPayload>(
    type: string,
    handler: JobHandler<TPayload>
  ): void;
}
