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
