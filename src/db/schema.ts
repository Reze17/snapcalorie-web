// Phase 0 placeholder. Real tables (users, meal_entries, meal_items,
// daily_summaries, ...) are introduced in Phase 1 per the cross-cutting
// rules in CLAUDE.md.
import { pgTable, serial } from "drizzle-orm/pg-core";

export const _schemaPlaceholder = pgTable("_schema_placeholder", {
  id: serial("id").primaryKey(),
});
