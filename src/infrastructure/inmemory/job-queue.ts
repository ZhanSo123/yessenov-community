import type { Job, JobHandler, JobQueue } from "@/domain/contracts";

type HandlerEntry = {
  type: string;
  handler: JobHandler;
};

export class InMemoryJobQueue implements JobQueue {
  private handlers = new Map<string, JobHandler>();
  private queue: Job[] = [];
  private processing = false;

  register<TPayload extends Record<string, unknown>>(
    type: string,
    handler: JobHandler<TPayload>
  ) {
    this.handlers.set(type, handler as JobHandler);
  }

  async enqueue<TPayload extends Record<string, unknown>>(job: Job<TPayload>) {
    const runAt = job.runAt?.getTime() ?? Date.now();
    const delay = Math.max(0, runAt - Date.now());
    if (delay > 0) {
      setTimeout(() => {
        this.queue.push(job as Job);
        if (!this.processing) {
          void this.drain();
        }
      }, delay);
      return;
    }

    this.queue.push(job as Job);
    if (!this.processing) {
      void this.drain();
    }
  }

  private async drain() {
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        continue;
      }
      const handler = this.handlers.get(job.type);
      if (!handler) {
        continue;
      }
      await handler(job);
    }
    this.processing = false;
  }
}
