import type { DomainEvent, EventBus, EventHandler, Unsubscribe } from "@/domain/contracts";

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  publish<TPayload extends Record<string, unknown>>(event: DomainEvent<TPayload>) {
    const specific = this.handlers.get(event.type);
    const wildcard = this.handlers.get("*");
    const tasks = new Set<EventHandler>();

    if (specific) {
      specific.forEach((handler) => tasks.add(handler));
    }
    if (wildcard) {
      wildcard.forEach((handler) => tasks.add(handler));
    }

    const runs = Array.from(tasks).map((handler) => Promise.resolve(handler(event)));
    return Promise.all(runs).then(() => undefined);
  }

  subscribe<TPayload extends Record<string, unknown>>(
    type: string,
    handler: EventHandler<TPayload>
  ): Unsubscribe {
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
}
