CREATE TABLE "piece_jointe" (
	"id" text PRIMARY KEY NOT NULL,
	"type_source" text NOT NULL,
	"source_id" text NOT NULL,
	"nom" text NOT NULL,
	"mime_type" text,
	"taille" integer NOT NULL,
	"contenu" "bytea" NOT NULL,
	"description" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "piece_jointe_source_idx" ON "piece_jointe" USING btree ("type_source","source_id");