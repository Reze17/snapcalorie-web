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

## Phase status

- [x] Phase 0 — Scaffold, tooling & CI
- [x] Phase 1 — Database schema & data layer
- [ ] Phase 2 — Auth, profile & calorie goal
- [ ] Phase 3 — Provider adapter + mock vision service
- [ ] Phase 4 — Capture, upload & image pipeline
- [ ] Phase 5 — Detection, portion & macro engine
- [ ] Phase 6 — Review & edit screen
- [ ] Phase 7 — Daily dashboard & chronological log
- [ ] Phase 8 — Analytics, charts & streaks
- [ ] Phase 9 — Export pipeline (CSV + PDF)
- [ ] Phase 10 — NFR hardening & release metrics
