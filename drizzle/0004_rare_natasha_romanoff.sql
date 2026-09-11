CREATE TABLE "weight_logs" (
	"weight_log_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logged_date" date NOT NULL,
	"weight_kg" numeric(5, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sex" varchar(6);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "height_cm" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activity_level" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "goal_type" varchar(8);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_weight_kg" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weight_logs_user_date_unique" ON "weight_logs" USING btree ("user_id","logged_date");--> statement-breakpoint
CREATE INDEX "weight_logs_user_date_idx" ON "weight_logs" USING btree ("user_id","logged_date" DESC NULLS LAST);