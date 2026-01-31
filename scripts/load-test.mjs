const target = process.env.LOAD_TEST_URL || "http://localhost:3000";
const total = Number(process.env.LOAD_TEST_TOTAL || 200);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 20);

const endpoints = [
  "/api/feed?mode=for-you",
  "/api/communities?scope=open",
  "/api/community-feed",
];

const run = async () => {
  console.log(`Load test target: ${target}`);
  console.log(`Requests: ${total}, concurrency: ${concurrency}`);

  const start = Date.now();
  let completed = 0;
  let failed = 0;

  const worker = async () => {
    while (true) {
      const current = completed + failed;
      if (current >= total) {
        return;
      }
      const endpoint = endpoints[current % endpoints.length];
      try {
        const response = await fetch(`${target}${endpoint}`);
        if (!response.ok) {
          failed += 1;
        } else {
          completed += 1;
        }
      } catch {
        failed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const duration = (Date.now() - start) / 1000;
  const rps = Math.round(total / duration);
  console.log(`Done in ${duration.toFixed(2)}s`);
  console.log(`Success: ${completed}, Failed: ${failed}, RPS: ${rps}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
