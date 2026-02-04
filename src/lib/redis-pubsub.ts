import { createClient, type RedisClientType } from "redis";

const redisUrl = process.env.REDIS_URL ?? "";
const hasRedis = Boolean(redisUrl);

const globalForPubSub = globalThis as unknown as {
  pub?: RedisClientType;
  sub?: RedisClientType;
  pubConnecting?: Promise<void> | null;
  subConnecting?: Promise<void> | null;
};

const ensurePub = async (client: RedisClientType) => {
  if (client.isOpen) return;
  if (!globalForPubSub.pubConnecting) {
    globalForPubSub.pubConnecting = client.connect().finally(() => {
      globalForPubSub.pubConnecting = null;
    });
  }
  await globalForPubSub.pubConnecting;
};

const ensureSub = async (client: RedisClientType) => {
  if (client.isOpen) return;
  if (!globalForPubSub.subConnecting) {
    globalForPubSub.subConnecting = client.connect().finally(() => {
      globalForPubSub.subConnecting = null;
    });
  }
  await globalForPubSub.subConnecting;
};

const getPubClient = () => {
  if (!hasRedis) return null;
  if (!globalForPubSub.pub) {
    globalForPubSub.pub = createClient({ url: redisUrl });
  }
  return globalForPubSub.pub;
};

const getSubClient = () => {
  if (!hasRedis) return null;
  if (!globalForPubSub.sub) {
    globalForPubSub.sub = createClient({ url: redisUrl });
  }
  return globalForPubSub.sub;
};

export const redisPubSubReady = hasRedis;

export const publishRaw = async (channel: string, message: string) => {
  const client = getPubClient();
  if (!client) return false;
  await ensurePub(client);
  await client.publish(channel, message);
  return true;
};

export const subscribeRaw = async (
  channel: string,
  handler: (message: string) => void
) => {
  const client = getSubClient();
  if (!client) return false;
  await ensureSub(client);
  await client.subscribe(channel, handler);
  return true;
};

export const unsubscribeRaw = async (
  channel: string,
  handler?: (message: string) => void
) => {
  const client = getSubClient();
  if (!client) return false;
  await ensureSub(client);
  if (handler) {
    await client.unsubscribe(channel, handler);
  } else {
    await client.unsubscribe(channel);
  }
  return true;
};
