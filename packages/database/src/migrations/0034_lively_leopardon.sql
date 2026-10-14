CREATE TYPE "public"."nis2_correspondance_iso" AS ENUM('elevee', 'moyenne', 'faible');--> statement-breakpoint
CREATE TABLE "exigence_nis2_iso" (
	"id" text PRIMARY KEY NOT NULL,
	"exigence_nis2_id" text NOT NULL,
	"norme" text NOT NULL,
	"reference" text NOT NULL,
	"intitule" text NOT NULL,
	"ordre" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exigence_nis2" ADD COLUMN "correspondance_iso" "nis2_correspondance_iso";--> statement-breakpoint
ALTER TABLE "exigence_nis2" ADD COLUMN "observations_iso" text;--> statement-breakpoint
ALTER TABLE "exigence_nis2_iso" ADD CONSTRAINT "exigence_nis2_iso_exigence_nis2_id_exigence_nis2_id_fk" FOREIGN KEY ("exigence_nis2_id") REFERENCES "public"."exigence_nis2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exigence_nis2_iso_unique" ON "exigence_nis2_iso" USING btree ("exigence_nis2_id","norme","reference");