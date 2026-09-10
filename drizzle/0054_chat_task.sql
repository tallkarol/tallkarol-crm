ALTER TABLE "chat_threads" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_threads_task_idx" ON "chat_threads" USING btree ("task_id");
