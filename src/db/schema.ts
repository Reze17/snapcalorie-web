import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Note: the JS property is `id` (required by @auth/drizzle-adapter's
// expected users-table shape) but the DB column stays `user_id`, per the
// FRD §5 DDL.
export const users = pgTable("users", {
  id: uuid("user_id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  name: varchar("name", { length: 255 }),
  image: text("image"),
  passwordHash: text("password_hash"),
  dailyCalorieTarget: integer("daily_calorie_target").notNull().default(2000),
  timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),

  // --- Personalized goal system (post-Phase-10) ---
  // All nullable: a user who signed up before this feature, or who hasn't
  // finished onboarding yet, has none of these set. onboardingCompletedAt
  // is the single gate the (app) layout checks to redirect to /onboarding
  // — everything else here is an input to src/lib/goal-calc.ts, not a
  // gate itself.
  age: integer("age"),
  sex: varchar("sex", { length: 6 }), // "male" | "female" — Mifflin-St Jeor needs a binary term
  heightCm: numeric("height_cm", { precision: 5, scale: 1 }),
  activityLevel: varchar("activity_level", { length: 16 }), // sedentary | light | moderate | very_active
  goalType: varchar("goal_type", { length: 8 }), // lose | maintain | gain
  targetWeightKg: numeric("target_weight_kg", { precision: 5, scale: 1 }),
  targetDate: date("target_date"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
});

// A user's weight is a time series, not a single column — this is the
// source of truth for both "current weight" (its latest row) and the
// weight-trend card (its full history). One entry per local day, upserted
// like daily_summaries, so re-logging today's weight corrects rather than
// duplicates.
export const weightLogs = pgTable(
  "weight_logs",
  {
    weightLogId: uuid("weight_log_id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    loggedDate: date("logged_date").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 1 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("weight_logs_user_date_unique").on(
      table.userId,
      table.loggedDate,
    ),
    index("weight_logs_user_date_idx").on(
      table.userId,
      table.loggedDate.desc(),
    ),
  ],
);

// Auth.js (NextAuth v5) adapter tables. Session strategy is JWT (see
// src/auth.ts for why), so `sessions` stays unused by credentials
// sign-in, but OAuth account linking relies on `accounts`.
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const mealEntries = pgTable(
  "meal_entries",
  {
    entryId: uuid("entry_id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    imageStoragePath: text("image_storage_path").notNull(),
    totalCalories: numeric("total_calories", {
      precision: 7,
      scale: 2,
    }).notNull(),
    totalProtein: numeric("total_protein", {
      precision: 6,
      scale: 2,
    }).notNull(),
    totalCarbs: numeric("total_carbs", { precision: 6, scale: 2 }).notNull(),
    totalFat: numeric("total_fat", { precision: 6, scale: 2 }).notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("meal_entries_user_logged_idx").on(
      table.userId,
      table.loggedAt.desc(),
    ),
  ],
);

export const mealItems = pgTable(
  "meal_items",
  {
    itemId: uuid("item_id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => mealEntries.entryId, { onDelete: "cascade" }),
    foodName: varchar("food_name", { length: 150 }).notNull(),
    portionGrams: numeric("portion_grams", {
      precision: 6,
      scale: 2,
    }).notNull(),
    calories: numeric("calories", { precision: 6, scale: 2 }).notNull(),
    protein: numeric("protein", { precision: 5, scale: 2 }).notNull(),
    carbs: numeric("carbs", { precision: 5, scale: 2 }).notNull(),
    fat: numeric("fat", { precision: 5, scale: 2 }).notNull(),
    aiConfidence: numeric("ai_confidence", { precision: 3, scale: 2 }),
    isUserEdited: boolean("is_user_edited").default(false),
  },
  (table) => [index("meal_items_entry_idx").on(table.entryId)],
);

// Not part of the FRD §5 DDL — added in Phase 9 to support async CSV/PDF
// generation for large date ranges (FR-10). storageKey points at the
// generated file in the same S3-compatible bucket used for meal photos.
export const exportJobs = pgTable(
  "export_jobs",
  {
    jobId: uuid("job_id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    format: varchar("format", { length: 8 }).notNull(), // "csv" | "pdf"
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | processing | ready | failed
    storageKey: text("storage_key"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("export_jobs_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  ],
);

// Phase 10 (FRD §6 latency NFR): one row per timed stage of the
// capture->analyze->save pipeline. entryId is nullable since some stages
// (e.g. vision_inference) happen before a meal_entries row exists yet.
export const latencyEvents = pgTable(
  "latency_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    event: varchar("event", { length: 32 }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    entryId: uuid("entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("latency_events_event_created_idx").on(
      table.event,
      table.createdAt.desc(),
    ),
  ],
);

// Phase 10 (FRD §6 security NFR): fixed-window rate limiting, Postgres-backed
// since this stack has no Redis. `key` is caller-defined (e.g.
// "analysis:{userId}", "login:{email}:{ip}") and `windowStart` is the start
// of the current fixed window for that key — see src/server/lib/rate-limit.ts.
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: varchar("key", { length: 255 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);

export const dailySummaries = pgTable(
  "daily_summaries",
  {
    summaryId: uuid("summary_id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    summaryDate: date("summary_date").notNull(),
    targetCalories: integer("target_calories").notNull(),
    consumedCalories: numeric("consumed_calories", {
      precision: 7,
      scale: 2,
    }).notNull(),
    achievementPercentage: numeric("achievement_percentage", {
      precision: 5,
      scale: 2,
    }).notNull(),
    streakCount: integer("streak_count").default(0),
  },
  (table) => [
    uniqueIndex("daily_summaries_user_date_unique").on(
      table.userId,
      table.summaryDate,
    ),
  ],
);
