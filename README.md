This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

IMPORTANT: restart the dev server after any `.env` or `.env.local` changes.

## Required .env.local

Use `.env.local` as the single source of truth for auth settings (do not duplicate
`NEXTAUTH_URL` in `.env`):

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-real-secret-string"
AUTH_TRUST_HOST="true"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

Note: `NEXTAUTH_SECRET` must be a real string value, not a command like
`openssl rand -base64 32`.

Do not commit `.env.local` or cache/build artifacts (for example `.npm-cache`, `.next`, `node_modules`).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Troubleshooting npm install (ENOTFOUND)

If `npm install` fails with `ENOTFOUND` (registry/DNS/network), try:

```bash
npm config get registry
npm config set registry https://registry.npmjs.org/
npm config delete proxy
npm config delete https-proxy
```

Then check DNS/VPN/firewall and retry `npm install`.

## Dev sanity checks

- `GET /api/auth/session` returns user after Google login.
- For you feed loads without login.
- Following feed prompts login when unauthenticated.
- Like toggle updates count.
- Replies create and appear in `/p/[id]`.
- Profile loads at `/u/[username]`.
- Admin access: promote yourself with SQL:
  - `update "User" set role='ADMIN' where email='you@example.com';`
- Admin UI available at `/admin` after role upgrade.
- Moderation rate-limits are in-memory for dev; use Redis or a shared store in production.

## Auth smoke checklist

- Restart `npm run dev` after env changes.
- Open `/welcome` and sign in with credentials.
- In DevTools -> Storage -> Cookies -> localhost, see `authjs.session-token`.
- Click "WhoAmI (dev)" to confirm `hasSession: true`.
- Refresh the page: UI should stay authenticated.

## Host mismatch = session null

If you open the site via a different host (e.g. `http://192.168.x.x:3000`)
while `NEXTAUTH_URL` is `http://localhost:3000`, Safari will drop the session
cookie. Always use the exact host from `NEXTAUTH_URL` and restart `npm run dev`
after changes.

## Deploy to Vercel (GitHub)

GitHub push:

```bash
git init
git add .
git commit -m "initial private alpha"
git branch -M main
git remote add origin <GITHUB_REPO_URL>
git push -u origin main
```

Vercel:

1) Import the repo.
2) Add Environment Variables (Production + Preview).
3) Redeploy.

Environment Variables:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
NEXTAUTH_URL=https://<your-vercel-domain>
NEXTAUTH_SECRET=<random-32+-chars>
AUTH_TRUST_HOST=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
INVITE_ONLY=true
INVITE_CODES=alpha1,alpha2,alpha3
```

Google OAuth redirect URI:

```
https://<your-vercel-domain>/api/auth/callback/google
```

Smoke checklist:

- `/welcome` → Google login → `/invite` → `/onboarding` → `/`
- Create a post
- Open `/admin/alpha`

Note: do not commit `.env.local` or cache/build artifacts (for example `.npm-cache`, `.next`, `node_modules`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
