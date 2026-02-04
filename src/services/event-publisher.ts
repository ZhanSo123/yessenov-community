import { getInfrastructure } from "@/infrastructure";
import { registerEventHandlers } from "@/events/register";

export type EventPayload = Record<string, unknown>;

export const publishDomainEvent = async (type: string, payload: EventPayload) => {
  const provider = process.env.EVENT_BUS_PROVIDER ?? "memory";
  if (provider !== "queue") {
    registerEventHandlers();
  }
  const infra = getInfrastructure();
  await infra.eventBus.publish({
    type,
    occurredAt: new Date(),
    payload,
  });
};
