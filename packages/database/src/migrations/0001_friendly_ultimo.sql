CREATE TYPE "public"."app_responsable_orga_type" AS ENUM('pole', 'composante', 'service', 'departement');--> statement-breakpoint
CREATE TABLE "personne_referent" (
	"id" text PRIMARY KEY NOT NULL,
	"personne_id" text NOT NULL,
	"titre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "responsable_orga_type" "app_responsable_orga_type";--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "responsable_orga_id" text;--> statement-breakpoint
ALTER TABLE "personne_referent" ADD CONSTRAINT "personne_referent_personne_id_personne_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personne"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personne_referent_unique" ON "personne_referent" USING btree ("personne_id","titre");