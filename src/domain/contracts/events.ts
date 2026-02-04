export type EventPayload = Record<string, unknown>;

export type DomainEvent<TPayload extends EventPayload = EventPayload> = {
  type: string;
  occurredAt: Date;
  payload: TPayload;
};

export type EventHandler<TPayload extends EventPayload = EventPayload> = (
  event: DomainEvent<TPayload>
) => Promise<void> | void;

export type Unsubscribe = () => void;

export interface EventBus {
  publish<TPayload extends EventPayload>(
    event: DomainEvent<TPayload>
  ): Promise<void>;
  subscribe<TPayload extends EventPayload>(
    type: string,
    handler: EventHandler<TPayload>
  ): Unsubscribe;
}
