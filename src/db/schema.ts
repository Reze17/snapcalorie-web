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
});

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
