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
- `docker compose up -d` — start local Postgres
- `npm run db:generate` / `npm run db:migrate` / `npm run db:studio` — Drizzle migrations
- `npm run test` — Vitest
- `npm run lint` / `npm run typecheck` / `npm run format:check`
