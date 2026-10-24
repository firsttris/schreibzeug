CREATE TYPE "public"."share_role" AS ENUM('edit', 'view');--> statement-breakpoint
CREATE TABLE "shares" (
	"node_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "share_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_node_id_user_id_pk" PRIMARY KEY("node_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shares_user" ON "shares" USING btree ("user_id");