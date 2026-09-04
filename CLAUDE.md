# SnapCalorie Web

An AI meal-photo calorie tracker. Built in 10 sequential phases (see README "Phase status"); one phase per Claude Code session, each gated by its own verification checklist before the next starts.

## Non-negotiable rules

These are correctness/UX requirements from the FRD that are easy to violate accidentally. They apply across every phase, not just the phase that first introduces the feature.

- **Timezone-correct days.** `meal_entries.logged_at` is `TIMESTAMPTZ`, but `daily_summaries.summary_date` is a `DATE` in the user's timezone (`users.timezone`). Never derive "which day" from server local time or UTC.
- **Historical targets are immutable.** `daily_summaries.target_calories` is a snapshot written when a day's first entry lands. Changing `users.daily_calorie_target` must never rewrite past summaries.
- **Upsert summaries.** `daily_summaries` has `UNIQUE(user_id, summary_date)` — always `INSERT ... ON CONFLICT DO UPDATE`, never a blind insert.
- **Money-style numerics.** Calories/macros are `NUMERIC`, not floats. Use a decimal type end-to-end; no float math on macros.
- **Confidence range.** `meal_items.ai_confidence` is stored 0.00–1.00; the ambiguity threshold is `< 0.70`.
- **Linear portion scaling.** `value_new = value_0 × (m_new / m_0)`. Any manual edit to a portion/value sets `is_user_edited = TRUE`.
- **Non-punitive UI.** Over-target states never use blocking modals, red alarm styling, or guilt language — neutral, factual, informational only.
- **Responsive 360px → 4K.** Mobile-first; nothing may horizontally scroll at 360px.

## Stack

Next.js 15 (App Router) + TypeScript (strict) · PostgreSQL + Drizzle ORM · Tailwind (mobile-first, `xs` breakpoint at 360px) · Vitest · S3-compatible storage (later phases).

## Commands

- `npm run dev` — start the dev server
- `docker compose up -d` — start local Postgres + MinIO (if using Colima instead of Docker Desktop, run `colima start` first, and prefix docker/compose commands with `DOCKER_CONTEXT=colima` if multiple Colima profiles exist)
- `npm run db:generate` / `npm run db:migrate` / `npm run db:studio` / `npm run db:seed` — Drizzle migrations + demo data
- `npm run test` — Vitest
- `npm run e2e` — Playwright (starts/reuses the dev server itself; needs Postgres + MinIO up first)
- `npm run lint` / `npm run typecheck` / `npm run format:check`

**Never run `npm run build` while a `next dev` process is also running against the same working copy** — both write to `.next/`, and a concurrent production build corrupts the dev server's routing state (every route starts 404ing until it's restarted). Stop the dev server first, build, then restart it if you still need it.

## Data access layer (Phase 1)

- `src/db/schema.ts` — Drizzle schema for `users`, `meal_entries`, `meal_items`, `daily_summaries`.
- `src/server/repositories/` — typed repository functions. `createMealEntryWithItems`, `updateMealEntry`, and `deleteMealEntry` each run in a single transaction and always call `recalculateDailySummary` for every affected local day afterward.
- `src/server/lib/timezone.ts` — the only place day-boundary math should happen (`localDayRangeUtc`, `instantToLocalDate`), per the timezone-correctness rule above.
- Macro/calorie arithmetic uses `decimal.js`; all `NUMERIC` columns round-trip as strings, not JS numbers.

## Auth (Phase 2)

- `src/auth.ts` — Auth.js (NextAuth v5) config: Credentials (email/password, bcryptjs) + Google, `@auth/drizzle-adapter` against `users`/`accounts`/`sessions`/`verification_tokens`.
- **Session strategy is `"jwt"`, not `"database"`, on purpose.** Auth.js's Credentials provider always issues a JWT-encoded cookie and never creates an adapter session row, regardless of the configured strategy (see `node_modules/@auth/core/lib/actions/callback/index.js`) — so "database sessions" isn't actually available for email/password. Using `jwt` globally keeps Google on the same cookie format and keeps `src/middleware.ts` Edge-compatible.
- `users` table: the Drizzle **JS property is `id`** (required by `@auth/drizzle-adapter`'s expected shape) but the **DB column stays `user_id`** — don't rename the column, and don't reintroduce a separate `userId` property on that table.
- `Google({ allowDangerousEmailAccountLinking: true })` is required for FR-01's "same email reuses the same user" behavior — this is Auth.js's own documented opt-in, not an oversight.
- `src/middleware.ts` uses `next-auth/jwt`'s `getToken()` directly instead of importing `@/auth` — importing the full config would pull `pg` and `bcryptjs` into the Edge middleware bundle and break it. Extend `PROTECTED_PREFIXES` there (and rely on the `(app)` layout's server-side `auth()` check as a backstop) as new protected routes are added in later phases.
- Google OAuth needs real `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` credentials to test; email/password needs no external setup. See README "Testing auth end to end".

## Vision service (Phase 3)

- `src/server/vision/types.ts` is the provider-agnostic contract (`INutritionVisionService`, `AnalysisResult`, `DetectedFood`, `FoodSearchResult`). Nothing provider-specific may leak into it — no vendor SDK types, ever.
- **Every `DetectedFood` carries `per100g`.** Phase 6's portion-edit rescaling (`value_new = value_0 × (m_new / m_0)`, see rule above) needs that fixed baseline — don't drop it when a later phase touches this code.
- `src/server/vision/factory.ts`'s `getVisionService()` is the only place `VISION_PROVIDER` is read. Call sites depend on the interface only, never on `MockVisionService` (or any future provider class) directly.
- `src/server/vision/normalize.ts` maps `AnalysisResult` → `meal_items` row shape (fixed-point strings at the column scale, confidence clamped to `[0,1]`) — this is what Phase 5/6 should call before inserting, not ad-hoc rounding.
- `src/server/vision/contract.ts`'s `runVisionServiceContractTests(label, factory)` must be run against any new provider implementation (openai/anthropic/google, when they land) in addition to that provider's own tests.
- `MockVisionService` scenarios (`default | lowConfidence | singleItem | empty | timeout`) are the fixtures later phases should build their UI/tests against — see README "Vision service (mock)".

## Capture, upload & storage (Phase 4)

- `src/lib/image/process.ts` (`processImageFile`) validates (type + 20MB cap), downsamples to `MAX_EDGE_PX` (1920), and re-encodes to JPEG at `JPEG_QUALITY` (0.85) — client-side only, runs in the browser.
- **Do not add manual EXIF-orientation correction back into this pipeline.** It used to exist (`getOrientedCanvasSize`/`applyOrientationTransform`, removed in Phase 4) and was verified — by hand-crafting a real EXIF-tagged JPEG and inspecting it in a real browser — to double-rotate portrait photos: `createImageBitmap` (with or without `imageOrientation: "none"`) and `<img>`/`naturalWidth`/`naturalHeight` all already return EXIF-corrected dimensions/pixels in current evergreen browsers, with no reliable way to opt out. `computeDownsampleDimensions` (`src/lib/image/resize.ts`) is the only "resize helper"; it just works off whatever width/height the browser reports, which is already orientation-correct.
- `src/server/storage/` is the S3-compatible storage layer (`@aws-sdk/client-s3` + `s3-request-presigner`), MinIO locally (`docker-compose.yml`'s `minio`/`minio-init` services) via `S3_ENDPOINT` + `forcePathStyle`. `createPresignedUploadUrl(userId)` always derives the key from the **authenticated session's** user id (`users/{userId}/meals/{uuid}.jpg`) — never accept a client-supplied userId for this. Both upload and download presigned URLs expire in exactly `PRESIGNED_URL_EXPIRY_SECONDS` (15 min); the bucket itself is never made public.
- `/capture` → upload → `/analyze?key=...` is the flow; `/analyze` is a placeholder until Phase 5. Both routes (plus `/dashboard`, `/profile`) are in `PROTECTED_PREFIXES` in `src/middleware.ts`.
- `e2e/` holds the Playwright suite (`npm run e2e`) — real browser, real MinIO, no mocking. `e2e/fixtures/sample-meal.jpg` is a small checked-in JPEG; don't commit large fixtures.
