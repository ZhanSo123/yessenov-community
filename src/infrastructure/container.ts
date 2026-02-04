import type {
  CacheStore,
  EventBus,
  JobQueue,
  RealtimeGateway,
  SearchIndex,
} from "@/domain/contracts";

import { JobQueueEventBus } from "@/infrastructure/adapters/job-queue-event-bus";
import { LegacyCacheStore } from "@/infrastructure/adapters/legacy-cache";
import { PostgresJobQueue } from "@/infrastructure/adapters/postgres-job-queue";
import { RedisRealtimeGateway } from "@/infrastructure/adapters/redis-realtime";
import { InMemoryEventBus } from "@/infrastructure/inmemory/event-bus";
import { InMemoryJobQueue } from "@/infrastructure/inmemory/job-queue";
import { InMemoryRealtimeGateway } from "@/infrastructure/inmemory/realtime";
import { InMemorySearchIndex } from "@/infrastructure/inmemory/search";

export type Infrastructure = {
  cache: CacheStore;
  eventBus: EventBus;
  jobQueue: JobQueue;
  search: SearchIndex;
  realtime: RealtimeGateway;
};

const globalForInfra = globalThis as unknown as {
  infra?: Infrastructure;
};

const createInfrastructure = (): Infrastructure => {
  const jobQueueProvider = process.env.JOB_QUEUE_PROVIDER ?? "memory";
  const jobQueue =
    jobQueueProvider === "postgres"
      ? new PostgresJobQueue()
      : new InMemoryJobQueue();

  const eventBusProvider = process.env.EVENT_BUS_PROVIDER ?? "memory";
  const eventBus =
    eventBusProvider === "queue"
      ? new JobQueueEventBus(jobQueue)
      : new InMemoryEventBus();

  const realtimeProvider = process.env.REALTIME_PROVIDER ?? "memory";
  const realtime =
    realtimeProvider === "redis"
      ? new RedisRealtimeGateway()
      : new InMemoryRealtimeGateway();

  return {
    cache: new LegacyCacheStore(),
    eventBus,
    jobQueue,
    search: new InMemorySearchIndex(),
    realtime,
  };
};

let infrastructure = globalForInfra.infra ?? createInfrastructure();

if (process.env.NODE_ENV !== "production") {
  globalForInfra.infra = infrastructure;
}

export const getInfrastructure = () => infrastructure;

export const setInfrastructure = (next: Infrastructure) => {
  infrastructure = next;
  if (process.env.NODE_ENV !== "production") {
    globalForInfra.infra = infrastructure;
  }
};
