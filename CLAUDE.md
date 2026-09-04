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
- `docker compose up -d` — start local Postgres (if using Colima instead of Docker Desktop, run `colima start` first, and prefix docker/compose commands with `DOCKER_CONTEXT=colima` if multiple Colima profiles exist)
- `npm run db:generate` / `npm run db:migrate` / `npm run db:studio` / `npm run db:seed` — Drizzle migrations + demo data
- `npm run test` — Vitest
- `npm run lint` / `npm run typecheck` / `npm run format:check`

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
