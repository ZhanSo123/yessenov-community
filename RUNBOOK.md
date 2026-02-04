# Yessenov Community — Runbook

## Backups
- **Primary storage**: Neon Postgres (managed backups + PITR if enabled).
- **Recommended**: enable Point‑in‑Time Recovery in Neon console.
- **Weekly export** (manual):
  - `pg_dump "$DATABASE_URL" > backup_$(date +%F).sql`
  - Store in a secure bucket (S3/Backblaze) with 30–90 day retention.

## Restore (manual)
1) Create a fresh DB in Neon.
2) Restore:
   - `psql "$DATABASE_URL" < backup_YYYY-MM-DD.sql`
3) Run migrations:
   - `npx prisma migrate deploy`

## Incident checklist
- Check `/admin/errors` and `/admin/audit`.
- Verify DB connectivity (Neon status).
- Roll back recent deploy or feature flag.
- Capture error logs and notify stakeholders.

## Load testing
- `npm run load:test`
- Env:
  - `LOAD_TEST_URL` (default: http://localhost:3000)
  - `LOAD_TEST_TOTAL` (default: 200)
  - `LOAD_TEST_CONCURRENCY` (default: 20)

## Cache keys (Redis or in-memory fallback)
Redis is used when `REDIS_URL` is set (self‑hosted).

Note: Some migrations add partial indexes for feed/profile queries (Postgres `WHERE` indexes). Keep them when applying migrations.
Otherwise, the app falls back to an in-memory cache (not shared across instances).
**TTL (approx):**
- `feed:*` — 20–30s
- `community-feed:*` — 30s
- `posts:*` — 20s
- `post:*` — 20s
- `post-replies:*` — 15–20s
- `profile-posts:*` — 20s
- `profile-replies:*` — 20s
- `profile-header:*` — 20s
- `communities:open:*` — 60s
- `communities:recommended:*` — 30s
- `communities:accessible:*` — 30s
- `community-access:*` — 60s
- `user-by-username:*` — 5m
- `dm:inbox:*` — 10–15s
- `dm:thread:*` — 10–15s
- `notifications:list:*` — 12s
- `notifications:unread:*` — 8s

**Invalidation (prefix-based):**
- Posts create/reply/delete/like → `feed:*`, `community-feed:*`, `posts:*`, `post:*`, `post-replies:*`, `profile-posts:*`, `profile-replies:*`, `profile-header:*`
- Follow toggle → `feed:following:*`, `profile-posts:*`, `profile-replies:*`, `profile-header:*`
- DM send/read → `dm:inbox:*`, `dm:thread:*`
- Communities create → `communities:*`, `community-access:*`
- Notifications create/mark read → `notifications:list:*`, `notifications:unread:*`

## Job worker (DB-backed queue)
Enable the internal queue:
- `JOB_QUEUE_PROVIDER=postgres`
- `EVENT_BUS_PROVIDER=queue` (optional)

Run worker:
- `npm run worker:jobs`

If `EVENT_BUS_PROVIDER=memory` (default), event handlers run inside the API process.
If `EVENT_BUS_PROVIDER=queue`, notification/mention events are processed by the job worker.

Background jobs:
- `abuse.scan.post` — lightweight content heuristics → `ModerationAction` + realtime flag.

## Realtime (SSE)
Enable Redis-backed realtime fanout:
- `REALTIME_PROVIDER=redis`
- `REDIS_URL=...` (required for pub/sub)

Client connects to:
- `GET /api/realtime/stream?channels=user:<userId>`

Moderation stream (MOD/ADMIN):
- `GET /api/realtime/stream?channels=moderation:system`
Events include: `post.autohidden`, `post.flagged`, `post.deleted`, `post.restored`.
