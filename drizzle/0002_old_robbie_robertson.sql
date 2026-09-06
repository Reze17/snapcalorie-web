CREATE TABLE "export_jobs" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"format" varchar(8) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_jobs_user_created_idx" ON "export_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);