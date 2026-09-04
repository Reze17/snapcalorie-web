# SnapCalorie Web

An AI meal-photo calorie tracker. See [CLAUDE.md](./CLAUDE.md) for the project's non-negotiable rules.

## Getting started

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run db:seed   # optional: demo user with ~14 days of entries
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

> Using Colima instead of Docker Desktop? Run `colima start` first, and prefix
> `docker`/`docker compose` commands with `DOCKER_CONTEXT=colima` if your
> machine has more than one Colima profile.

## Testing auth end to end

Email/password works out of the box with no external setup:

1. Go to `/signup`, create an account. You're auto-logged-in and redirected
   to `/dashboard`.
2. Check the row: `daily_calorie_target` is `2000` and `timezone` is `UTC`.
3. Go to `/profile`, change the calorie target and timezone, save — the
   `users` row updates, no `daily_summaries` row is touched.
4. Click "Sign out" — you land on `/login`.
5. Visit `/dashboard` while logged out — you're redirected to
   `/login?callbackUrl=%2Fdashboard`.
6. Log back in with the same email/password — you land back on `/dashboard`.

Google sign-in needs real OAuth credentials (`AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` in `.env`, from a Google Cloud OAuth client with
`http://localhost:3000/api/auth/callback/google` as an authorized redirect
URI). With those set, signing in with Google using the same email as an
existing credentials account signs you into that same account (see
`allowDangerousEmailAccountLinking` in `src/auth.ts`).

## Phase status

- [x] Phase 0 — Scaffold, tooling & CI
- [x] Phase 1 — Database schema & data layer
- [x] Phase 2 — Auth, profile & calorie goal
- [ ] Phase 3 — Provider adapter + mock vision service
- [ ] Phase 4 — Capture, upload & image pipeline
- [ ] Phase 5 — Detection, portion & macro engine
- [ ] Phase 6 — Review & edit screen
- [ ] Phase 7 — Daily dashboard & chronological log
- [ ] Phase 8 — Analytics, charts & streaks
- [ ] Phase 9 — Export pipeline (CSV + PDF)
- [ ] Phase 10 — NFR hardening & release metrics
