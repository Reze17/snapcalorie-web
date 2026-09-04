CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "daily_summaries" (
	"summary_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"summary_date" date NOT NULL,
	"target_calories" integer NOT NULL,
	"consumed_calories" numeric(7, 2) NOT NULL,
	"achievement_percentage" numeric(5, 2) NOT NULL,
	"streak_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "meal_entries" (
	"entry_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"image_storage_path" text NOT NULL,
	"total_calories" numeric(7, 2) NOT NULL,
	"total_protein" numeric(6, 2) NOT NULL,
	"total_carbs" numeric(6, 2) NOT NULL,
	"total_fat" numeric(6, 2) NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_items" (
	"item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"food_name" varchar(150) NOT NULL,
	"portion_grams" numeric(6, 2) NOT NULL,
	"calories" numeric(6, 2) NOT NULL,
	"protein" numeric(5, 2) NOT NULL,
	"carbs" numeric(5, 2) NOT NULL,
	"fat" numeric(5, 2) NOT NULL,
	"ai_confidence" numeric(3, 2),
	"is_user_edited" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"daily_calorie_target" integer DEFAULT 2000 NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entries" ADD CONSTRAINT "meal_entries_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_entry_id_meal_entries_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."meal_entries"("entry_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_summaries_user_date_unique" ON "daily_summaries" USING btree ("user_id","summary_date");--> statement-breakpoint
CREATE INDEX "meal_entries_user_logged_idx" ON "meal_entries" USING btree ("user_id","logged_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "meal_items_entry_idx" ON "meal_items" USING btree ("entry_id");