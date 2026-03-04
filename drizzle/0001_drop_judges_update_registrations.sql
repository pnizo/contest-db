DROP TABLE "judges";--> statement-breakpoint
ALTER TABLE "registrations" RENAME COLUMN "pref" TO "province";--> statement-breakpoint
ALTER TABLE "registrations" DROP COLUMN IF EXISTS "contest_order";
