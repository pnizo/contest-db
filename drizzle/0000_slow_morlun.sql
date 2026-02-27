CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" varchar(50) NOT NULL,
	"order_date" varchar(20) NOT NULL,
	"shopify_id" varchar(50) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"total_price" varchar(20) DEFAULT '0' NOT NULL,
	"financial_status" varchar(50) DEFAULT '' NOT NULL,
	"fulfillment_status" varchar(50) DEFAULT '' NOT NULL,
	"product_name" varchar(500) NOT NULL,
	"variant" varchar(255) DEFAULT '' NOT NULL,
	"price" varchar(20) DEFAULT '0' NOT NULL,
	"line_item_id" varchar(50) DEFAULT '' NOT NULL,
	"product_id" varchar(50) DEFAULT '' NOT NULL,
	"item_sub_no" integer DEFAULT 0 NOT NULL,
	"is_usable" boolean DEFAULT true NOT NULL,
	"owner_shopify_id" varchar(50) NOT NULL,
	"reserved_seat" varchar(50) DEFAULT '' NOT NULL,
	"tag1" varchar(255),
	"tag2" varchar(255),
	"tag3" varchar(255),
	"tag4" varchar(255),
	"tag5" varchar(255),
	"tag6" varchar(255),
	"tag7" varchar(255),
	"tag8" varchar(255),
	"tag9" varchar(255),
	"tag10" varchar(255),
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_ticket_line_item" UNIQUE("line_item_id","item_sub_no")
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_name" varchar(255) NOT NULL,
	"contest_date" varchar(20) NOT NULL,
	"contest_place" varchar(255),
	"is_ready" boolean DEFAULT false NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_date" varchar(20),
	"contest_name" varchar(255),
	"ticket_type" varchar(100),
	"group_type" varchar(100),
	"name_ja" varchar(255) NOT NULL,
	"pass_type" varchar(100),
	"company_ja" varchar(255),
	"request_type" varchar(100),
	"ticket_count" integer DEFAULT 0,
	"is_checked_in" boolean DEFAULT false,
	"note" varchar(1000),
	"email" varchar(255),
	"phone" varchar(50),
	"contact_person" varchar(255),
	"is_pre_notified" boolean DEFAULT false,
	"is_post_mailed" boolean DEFAULT false,
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"restored_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255),
	"google_id" varchar(255),
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"restored_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"fwj_card_no" varchar(50) NOT NULL,
	"name_ja" varchar(255) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"npc_member_no" varchar(50),
	"note" varchar(1000),
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"restored_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_date" varchar(20) NOT NULL,
	"contest_name" varchar(255) NOT NULL,
	"name_ja" varchar(255) NOT NULL,
	"type" varchar(100) NOT NULL,
	"player_no" varchar(50),
	"fwj_card_no" varchar(50),
	"npc_member_no" varchar(50),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"note" varchar(2000),
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"restored_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"fwj_card_no" varchar(50),
	"contest_date" varchar(20) NOT NULL,
	"contest_name" varchar(255) NOT NULL,
	"contest_place" varchar(255),
	"category_name" varchar(255) NOT NULL,
	"placing" varchar(20),
	"player_no" varchar(50),
	"player_name" varchar(255),
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"restored_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "judges" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_name" varchar(255) NOT NULL,
	"contest_date" varchar(20),
	"class_name" varchar(255) NOT NULL,
	"player_no" integer NOT NULL,
	"player_name" varchar(255),
	"placing" integer NOT NULL,
	"score_j1" integer,
	"score_j2" integer,
	"score_j3" integer,
	"score_j4" integer,
	"score_j5" integer,
	"score_j6" integer,
	"score_j7" integer,
	"score_t" integer,
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_date" varchar(20) NOT NULL,
	"contest_name" varchar(255) NOT NULL,
	"player_no" varchar(50),
	"name_ja" varchar(255),
	"name_ja_kana" varchar(255),
	"fwj_card_no" varchar(50),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"country" varchar(100),
	"pref" varchar(20),
	"age" varchar(10),
	"class_name" varchar(255),
	"sort_index" varchar(50),
	"score_card" varchar(50),
	"contest_order" varchar(50),
	"height" varchar(20),
	"weight" varchar(20),
	"occupation" varchar(255),
	"instagram" varchar(255),
	"biography" varchar(2000),
	"back_stage_pass" integer DEFAULT 0,
	"is_member" boolean DEFAULT false NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"restored_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"shopify_id" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"phone" varchar(50),
	"tags" varchar(1000),
	"address1" varchar(500),
	"address2" varchar(500),
	"city" varchar(255),
	"province" varchar(255),
	"zip" varchar(20),
	"country" varchar(100),
	"fwj_effectivedate" varchar(20),
	"fwj_birthday" varchar(20),
	"fwj_card_no" varchar(50),
	"fwj_nationality" varchar(100),
	"fwj_sex" varchar(20),
	"fwj_firstname" varchar(255),
	"fwj_lastname" varchar(255),
	"fwj_kanafirstname" varchar(255),
	"fwj_kanalastname" varchar(255),
	"fwj_height" varchar(20),
	"fwj_weight" varchar(20),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" varchar(50) NOT NULL,
	"order_date" varchar(30),
	"shopify_id" varchar(50),
	"full_name" varchar(255),
	"email" varchar(255),
	"total_price" varchar(20),
	"financial_status" varchar(50),
	"fulfillment_status" varchar(50),
	"product_name" varchar(500),
	"variant" varchar(255),
	"quantity" integer DEFAULT 0,
	"current_quantity" integer DEFAULT 0,
	"price" varchar(20),
	"line_item_id" varchar(50),
	"product_id" varchar(50) DEFAULT '',
	"back_stage_pass" integer DEFAULT 0,
	"occupation" varchar(255),
	"biography" varchar(2000),
	"tag1" varchar(255),
	"tag2" varchar(255),
	"tag3" varchar(255),
	"tag4" varchar(255),
	"tag5" varchar(255),
	"tag6" varchar(255),
	"tag7" varchar(255),
	"tag8" varchar(255),
	"tag9" varchar(255),
	"tag10" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_export_meta" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_tags" varchar(1000),
	"paid_only" boolean DEFAULT true,
	"exported_at" timestamp DEFAULT now(),
	"order_count" integer DEFAULT 0,
	"row_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"shopify_id" varchar(50) NOT NULL,
	"endpoint" varchar(2048) NOT NULL,
	"key_p256dh" varchar(512) NOT NULL,
	"key_auth" varchar(512) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_push_endpoint" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX "idx_tickets_owner_shopify_id" ON "tickets" USING btree ("owner_shopify_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_is_usable" ON "tickets" USING btree ("is_usable");--> statement-breakpoint
CREATE INDEX "idx_tickets_shopify_id" ON "tickets" USING btree ("shopify_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_order_no" ON "tickets" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "idx_contests_contest_date" ON "contests" USING btree ("contest_date");--> statement-breakpoint
CREATE INDEX "idx_contests_is_ready" ON "contests" USING btree ("is_ready");--> statement-breakpoint
CREATE INDEX "idx_guests_contest_name" ON "guests" USING btree ("contest_name");--> statement-breakpoint
CREATE INDEX "idx_guests_name_ja" ON "guests" USING btree ("name_ja");--> statement-breakpoint
CREATE INDEX "idx_guests_is_valid" ON "guests" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_google_id" ON "users" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX "idx_users_is_valid" ON "users" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_subjects_fwj_card_no" ON "subjects" USING btree ("fwj_card_no");--> statement-breakpoint
CREATE INDEX "idx_subjects_name_ja" ON "subjects" USING btree ("name_ja");--> statement-breakpoint
CREATE INDEX "idx_subjects_is_valid" ON "subjects" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_notes_contest_name" ON "notes" USING btree ("contest_name");--> statement-breakpoint
CREATE INDEX "idx_notes_contest_date" ON "notes" USING btree ("contest_date");--> statement-breakpoint
CREATE INDEX "idx_notes_fwj_card_no" ON "notes" USING btree ("fwj_card_no");--> statement-breakpoint
CREATE INDEX "idx_notes_is_valid" ON "notes" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_scores_fwj_card_no" ON "scores" USING btree ("fwj_card_no");--> statement-breakpoint
CREATE INDEX "idx_scores_contest_date" ON "scores" USING btree ("contest_date");--> statement-breakpoint
CREATE INDEX "idx_scores_contest_name" ON "scores" USING btree ("contest_name");--> statement-breakpoint
CREATE INDEX "idx_scores_category_name" ON "scores" USING btree ("category_name");--> statement-breakpoint
CREATE INDEX "idx_scores_is_valid" ON "scores" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_judges_contest_name" ON "judges" USING btree ("contest_name");--> statement-breakpoint
CREATE INDEX "idx_judges_class_name" ON "judges" USING btree ("class_name");--> statement-breakpoint
CREATE INDEX "idx_judges_is_valid" ON "judges" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_registrations_contest_date" ON "registrations" USING btree ("contest_date");--> statement-breakpoint
CREATE INDEX "idx_registrations_contest_name" ON "registrations" USING btree ("contest_name");--> statement-breakpoint
CREATE INDEX "idx_registrations_fwj_card_no" ON "registrations" USING btree ("fwj_card_no");--> statement-breakpoint
CREATE INDEX "idx_registrations_class_name" ON "registrations" USING btree ("class_name");--> statement-breakpoint
CREATE INDEX "idx_registrations_is_valid" ON "registrations" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_members_shopify_id" ON "members" USING btree ("shopify_id");--> statement-breakpoint
CREATE INDEX "idx_members_email" ON "members" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_members_fwj_card_no" ON "members" USING btree ("fwj_card_no");--> statement-breakpoint
CREATE INDEX "idx_orders_order_no" ON "orders" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "idx_orders_shopify_id" ON "orders" USING btree ("shopify_id");--> statement-breakpoint
CREATE INDEX "idx_orders_line_item_id" ON "orders" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_shopify_id" ON "push_subscriptions" USING btree ("shopify_id");