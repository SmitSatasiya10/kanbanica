ALTER TABLE "workspace" ADD COLUMN "invite_link_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "invite_link_max_uses" integer;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "invite_link_uses" integer DEFAULT 0 NOT NULL;