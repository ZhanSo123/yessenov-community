import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (process.env.DATABASE_URL) {
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.warn("DATABASE_URL not set, skipping prisma migrate deploy.");
}

run("next", ["build"]);
