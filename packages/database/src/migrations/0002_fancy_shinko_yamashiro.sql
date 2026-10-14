CREATE TYPE "public"."personne_titre_kind" AS ENUM('referent', 'mission');--> statement-breakpoint
DROP INDEX "personne_referent_unique";--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "pole_id" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "personne_referent" ADD COLUMN "kind" "personne_titre_kind" DEFAULT 'referent' NOT NULL;--> statement-breakpoint
ALTER TABLE "personne" ADD CONSTRAINT "personne_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personne" ADD CONSTRAINT "personne_pole_id_pole_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."pole"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personne" ADD CONSTRAINT "personne_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personne_referent_unique" ON "personne_referent" USING btree ("personne_id","titre","kind");