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

**Skipping login for manual testing:** set `DEV_BYPASS_AUTH=true` in `.env`
to hit every protected route (`/dashboard`, `/capture`, `/analyze`,
`/profile`) with no session at all — a fixed `dev-bypass@snapcalorie.local`
user is auto-provisioned, and a banner reminds you it's on. Set it back to
`false` (or delete the line) to test real login again.

## Vision service

`src/server/vision/` holds the `INutritionVisionService` interface and two
implementations, selected by `VISION_PROVIDER` with zero call-site changes:

```ts
import { getVisionService } from "@/server/vision/factory";

const vision = getVisionService(); // reads VISION_PROVIDER, defaults to "mock"
const result = await vision.analyzeMealImage({ imageBuffer, mimeType });
```

- `VISION_PROVIDER=mock` (the default) returns a fixed 3-item plate (grilled
  chicken breast, white rice, broccoli) with realistic macros and
  confidences ~0.91/0.88/0.94. No API key or network access needed. Force a
  scenario via `MockVisionService` constructor options (in tests) or
  `VISION_MOCK_SCENARIO` / `VISION_MOCK_LATENCY_MS` env vars (manual QA):
  `default | lowConfidence | singleItem | empty | timeout`.
- `VISION_PROVIDER=anthropic` calls Claude's Messages API (multimodal,
  forced tool-use for structured output) — see "Testing meal detection end
  to end" below for setup.
- `openai` / `google` are accepted by `VISION_PROVIDER` but throw a clear
  "not implemented yet" error.
- `src/server/vision/contract.ts` is a reusable Vitest suite
  (`runVisionServiceContractTests`) that any implementation must pass; run
  against both the mock (`mock-vision-service.test.ts`) and a mocked-network
  Anthropic client (`anthropic-vision-service.test.ts`).

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
4. On success you land on `/analyze?key=...`, which runs real (or mock)
   detection — see below.
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

## Testing meal detection end to end

The mock provider (`VISION_PROVIDER=mock`, the default) needs no setup —
uploading any photo on `/capture` always returns the same 3-item plate.

To use the real Claude vision provider instead:

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys).
2. In `.env`, set `VISION_PROVIDER=anthropic` and `VISION_API_KEY=<your key>`.
3. Restart the dev server, then upload a real photo of a plate of food on
   `/capture`.
4. `/analyze` shows an editable card per detected food item (grams, macros,
   a confidence badge). Items below 70% confidence are flagged "Low
   confidence" with up to 3 alternative identifications you can tap to swap.
5. Try a blurry or ambiguous photo to see the low-confidence path; try a
   photo of something that isn't food to see the "no items yet" state.
6. If the model's response fails schema validation, one repair attempt
   happens automatically (invisible to you); if it fails twice, or the
   request times out (12s), you'll see a "couldn't read this plate" message
   with a **Retry** button — your uploaded photo/key is never lost, and you
   can still search or add items manually while it's in that state.
7. Switch `VISION_PROVIDER` back to `mock` at any time — no other code
   changes needed.

## Testing the review & edit screen

Works the same regardless of which vision provider found the items (or
whether you added them all manually):

1. On `/analyze`, change an item's grams via the `−`/`+` steppers or by
   typing directly — calories and all three macros rescale instantly from
   that food's fixed per-100g values (try 180 → 240 on the mock's chicken
   breast: 297 kcal → 396 kcal, proportionally across protein/carbs/fat).
2. For a low-confidence item, tap one of its alternative chips to swap to
   it — macros recompute from the alternative's per100g at the same grams,
   and the item stops being flagged. Any item can also be swapped via
   "Replace via search".
3. "Delete" removes an item; the totals bar at the bottom recalculates
   immediately and always equals the exact sum of the current items.
4. Add a food via "Search foods manually" or "Or enter a food manually"
   (name + grams + macros you supply directly).
5. Tap "Save meal" — this is the one point where anything is written to the
   database: one `meal_entries` row + one `meal_items` row per item (each
   correctly marked `is_user_edited`), and that day's `daily_summaries` row
   updates. You land on `/dashboard` on success; on failure your edits stay
   on screen and the button re-enables so you can retry.
6. `npm run e2e` includes a Playwright test that drives this whole flow
   (edit → swap → add → save) and asserts the resulting DB rows directly.

## Phase status

- [x] Phase 0 — Scaffold, tooling & CI
- [x] Phase 1 — Database schema & data layer
- [x] Phase 2 — Auth, profile & calorie goal
- [x] Phase 3 — Provider adapter + mock vision service
- [x] Phase 4 — Capture, upload & image pipeline
- [x] Phase 5 — Detection, portion & macro engine
- [x] Phase 6 — Review & edit screen
- [ ] Phase 7 — Daily dashboard & chronological log
- [ ] Phase 8 — Analytics, charts & streaks
- [ ] Phase 9 — Export pipeline (CSV + PDF)
- [ ] Phase 10 — NFR hardening & release metrics
