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

## Vision service (mock)

No UI yet — this phase is the `INutritionVisionService` interface plus a
deterministic mock (`src/server/vision/`), for Phases 4-8 to build against
without burning API calls or needing network access.

```ts
import { getVisionService } from "@/server/vision/factory";

const vision = getVisionService(); // reads VISION_PROVIDER, defaults to "mock"
const result = await vision.analyzeMealImage({ imageBuffer, mimeType });
```

- `VISION_PROVIDER=mock` (the default) returns a fixed 3-item plate (grilled
  chicken breast, white rice, broccoli) with realistic macros and
  confidences ~0.91/0.88/0.94.
- Force a scenario via `MockVisionService` constructor options (in tests)
  or `VISION_MOCK_SCENARIO` / `VISION_MOCK_LATENCY_MS` env vars (manual QA):
  `default | lowConfidence | singleItem | empty | timeout`.
- `openai` / `anthropic` / `google` are accepted by `VISION_PROVIDER` but
  throw a clear "not implemented yet" error — later phases fill these in
  without changing any call site.
- `src/server/vision/contract.ts` is a reusable Vitest suite
  (`runVisionServiceContractTests`) that any implementation must pass; run
  against the mock in `mock-vision-service.test.ts`.

## Testing capture & upload end to end

1. Go to `/capture` (signed in). Click "Take photo" (opens the rear camera
   directly on a phone) or "Upload photo" / drag-and-drop a file.
2. A 12MP+ photo is downsampled client-side to ≤1920px on the longest edge
   and re-encoded as JPEG — the preview appears immediately, well under the
   original file size.
3. "Retake" discards it and returns to the picker; "Use this photo" requests
   a presigned upload URL (`users/{userId}/meals/{uuid}.jpg`, 15-minute
   expiry) and PUTs the processed image directly to storage, with a
   progress bar.
4. On success you land on `/analyze?key=...` (a placeholder until Phase 5).
5. Try a non-image file or one over 20MB — both are rejected inline with a
   plain-language message, before any upload is attempted.

Check the object landed and is private:

```bash
DOCKER_CONTEXT=colima docker compose exec minio \
  mc alias set local http://localhost:9000 snapcalorie snapcalorie123
DOCKER_CONTEXT=colima docker compose exec minio \
  mc ls --recursive local/snapcalorie-meals
```

A plain (non-presigned) GET to that object's URL should fail — the bucket
is private; only short-lived presigned URLs can read or write it.

Run `npm run e2e` (Playwright, real browser + real MinIO, no mocking) for
the automated version of this flow — it needs Postgres and MinIO up
(`docker compose up -d`) and will start/reuse the dev server itself.

## Phase status

- [x] Phase 0 — Scaffold, tooling & CI
- [x] Phase 1 — Database schema & data layer
- [x] Phase 2 — Auth, profile & calorie goal
- [x] Phase 3 — Provider adapter + mock vision service
- [x] Phase 4 — Capture, upload & image pipeline
- [ ] Phase 5 — Detection, portion & macro engine
- [ ] Phase 6 — Review & edit screen
- [ ] Phase 7 — Daily dashboard & chronological log
- [ ] Phase 8 — Analytics, charts & streaks
- [ ] Phase 9 — Export pipeline (CSV + PDF)
- [ ] Phase 10 — NFR hardening & release metrics
