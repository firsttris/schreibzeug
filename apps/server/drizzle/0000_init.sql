CREATE TYPE "public"."node_kind" AS ENUM('folder', 'file');--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"kind" "node_kind" NOT NULL,
	"name" text NOT NULL,
	"mime" text,
	"size" bigint,
	"version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trashed_at" timestamp with time zone,
	"trash_root" boolean DEFAULT false NOT NULL,
	CONSTRAINT "nodes_file_fields" CHECK (("nodes"."kind" = 'folder') = ("nodes"."mime" is null and "nodes"."size" is null and "nodes"."version" is null))
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_parent_id_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_file_id_nodes_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nodes_name_per_parent" ON "nodes" USING btree (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name")) WHERE "nodes"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX "nodes_parent" ON "nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "nodes_recent" ON "nodes" USING btree ("updated_at") WHERE "nodes"."kind" = 'file' and "nodes"."trashed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "versions_number_per_file" ON "versions" USING btree ("file_id","number");