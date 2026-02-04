import { publishRaw, redisPubSubReady, subscribeRaw, unsubscribeRaw } from "@/lib/redis-pubsub";

type RealtimeMessage = {
  channel: string;
  event: string;
  payload: Record<string, unknown>;
  at: string;
};

type Handler = (message: RealtimeMessage) => void;

const inMemory = new Map<string, Set<Handler>>();
const redisHandlers = new Map<string, Set<Handler>>();

const dispatch = (channel: string, message: RealtimeMessage) => {
  const handlers = inMemory.get(channel);
  if (!handlers) return;
  handlers.forEach((handler) => handler(message));
};

export const publishRealtime = async (message: RealtimeMessage) => {
  if (redisPubSubReady) {
    await publishRaw(`realtime:${message.channel}`, JSON.stringify(message));
    return;
  }

  dispatch(message.channel, message);
};

export const subscribeRealtime = async (
  channel: string,
  handler: Handler
): Promise<() => void> => {
  if (redisPubSubReady) {
    const redisChannel = `realtime:${channel}`;
    const set = redisHandlers.get(redisChannel) ?? new Set<Handler>();
    set.add(handler);
    redisHandlers.set(redisChannel, set);

    const listener = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as RealtimeMessage;
        handler(parsed);
      } catch {
        return;
      }
    };

    await subscribeRaw(redisChannel, listener);

    return () => {
      const existing = redisHandlers.get(redisChannel);
      if (existing) {
        existing.delete(handler);
        if (existing.size === 0) {
          redisHandlers.delete(redisChannel);
        }
      }
      void unsubscribeRaw(redisChannel, listener);
    };
  }

  const existing = inMemory.get(channel) ?? new Set<Handler>();
  existing.add(handler);
  inMemory.set(channel, existing);

  return () => {
    const set = inMemory.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      inMemory.delete(channel);
    }
  };
};
