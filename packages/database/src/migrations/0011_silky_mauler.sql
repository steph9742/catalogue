CREATE TYPE "public"."actif_categorie" AS ENUM('primaire', 'support');--> statement-breakpoint
CREATE TYPE "public"."propriete_dic" AS ENUM('disponibilite', 'integrite', 'confidentialite');--> statement-breakpoint
CREATE TABLE "actif_dependance" (
	"id" text PRIMARY KEY NOT NULL,
	"actif_id" text NOT NULL,
	"support_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actif_smsi" ADD COLUMN "categorie" "actif_categorie";--> statement-breakpoint
ALTER TABLE "risque_actif" ADD COLUMN "vulnerabilite" text;--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD COLUMN "propriete_impactee" "propriete_dic";--> statement-breakpoint
ALTER TABLE "actif_dependance" ADD CONSTRAINT "actif_dependance_actif_id_actif_smsi_id_fk" FOREIGN KEY ("actif_id") REFERENCES "public"."actif_smsi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actif_dependance" ADD CONSTRAINT "actif_dependance_support_id_actif_smsi_id_fk" FOREIGN KEY ("support_id") REFERENCES "public"."actif_smsi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actif_dependance_unique" ON "actif_dependance" USING btree ("actif_id","support_id");