import type { DomainEvent, EventBus, EventHandler, Unsubscribe } from "@/domain/contracts";

import type { JobQueue } from "@/domain/contracts";

const EVENT_JOB_TYPE = "__event__";

type EventJobPayload = {
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export class JobQueueEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private wildcardHandlers = new Set<EventHandler>();
  private registered = false;

  constructor(private readonly jobQueue: JobQueue) {
    this.ensureRegistered();
  }

  async publish<TPayload extends Record<string, unknown>>(
    event: DomainEvent<TPayload>
  ) {
    this.ensureRegistered();
    await this.jobQueue.enqueue({
      type: EVENT_JOB_TYPE,
      enqueuedAt: new Date(),
      payload: {
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload,
      } satisfies EventJobPayload,
    });
  }

  subscribe<TPayload extends Record<string, unknown>>(
    type: string,
    handler: EventHandler<TPayload>
  ): Unsubscribe {
    this.ensureRegistered();
    if (type === "*") {
      this.wildcardHandlers.add(handler as EventHandler);
      return () => {
        this.wildcardHandlers.delete(handler as EventHandler);
      };
    }

    const existing = this.handlers.get(type) ?? new Set<EventHandler>();
    existing.add(handler as EventHandler);
    this.handlers.set(type, existing);

    return () => {
      const set = this.handlers.get(type);
      if (!set) {
        return;
      }
      set.delete(handler as EventHandler);
      if (set.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  private ensureRegistered() {
    if (this.registered) {
      return;
    }
    this.registered = true;
    this.jobQueue.register(EVENT_JOB_TYPE, async (job) => {
      const payload = job.payload as EventJobPayload;
      if (!payload?.type) {
        return;
      }

      const event: DomainEvent = {
        type: payload.type,
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
        payload: (payload.payload ?? {}) as Record<string, unknown>,
      };

      const tasks = new Set<EventHandler>();
      const specific = this.handlers.get(event.type);
      if (specific) {
        specific.forEach((handler) => tasks.add(handler));
      }
      this.wildcardHandlers.forEach((handler) => tasks.add(handler));

      if (tasks.size === 0) {
        return;
      }

      await Promise.all(Array.from(tasks).map((handler) => handler(event)));
    });
  }
}
