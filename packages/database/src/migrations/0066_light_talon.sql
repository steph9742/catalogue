CREATE TYPE "public"."entite_edr_cible" AS ENUM('composante', 'service', 'departement', 'pole');--> statement-breakpoint
CREATE TABLE "correspondance_entite_edr" (
	"id" text PRIMARY KEY NOT NULL,
	"valeur" text NOT NULL,
	"cible_type" "entite_edr_cible" NOT NULL,
	"cible_id" text NOT NULL,
	"note" text,
	"declare_par" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "correspondance_entite_edr_valeur_unique" UNIQUE("valeur")
);
--> statement-breakpoint
ALTER TABLE "harfanglab_agent" ADD COLUMN "entite_edr" text;--> statement-breakpoint
ALTER TABLE "harfanglab_agent" ADD COLUMN "infos_additionnelles" jsonb;