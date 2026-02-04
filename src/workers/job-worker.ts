import { getInfrastructure } from "@/infrastructure";
import { PostgresJobQueue } from "@/infrastructure/adapters/postgres-job-queue";
import "@/workers/register-events";
import "@/workers/register-jobs";

const infra = getInfrastructure();
const queue = infra.jobQueue;

if (!(queue instanceof PostgresJobQueue)) {
  console.error("Job worker requires JOB_QUEUE_PROVIDER=postgres");
  process.exit(1);
}

const worker = queue.createWorker();

const shutdown = () => {
  worker.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

worker.start().catch((error) => {
  console.error("Job worker failed", error);
  process.exit(1);
});
