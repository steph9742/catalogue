CREATE TYPE "public"."nis2_secteur" AS ENUM('administration_publique', 'recherche', 'enseignement_superieur', 'sante', 'infrastructure_numerique', 'gestion_services_tic', 'eau_potable', 'eaux_usees', 'energie', 'espace', 'autre');--> statement-breakpoint
CREATE TYPE "public"."nis2_statut_entite" AS ENUM('essentielle', 'importante', 'non_assujettie', 'a_determiner');--> statement-breakpoint
CREATE TABLE "entite_nis2" (
	"id" text PRIMARY KEY NOT NULL,
	"statut" "nis2_statut_entite" DEFAULT 'a_determiner' NOT NULL,
	"secteur" "nis2_secteur",
	"secteur_autre" text,
	"enregistre_anssi" boolean DEFAULT false NOT NULL,
	"identifiant_anssi" text,
	"date_enregistrement" date,
	"referent_id" text,
	"justification_statut" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entite_nis2" ADD CONSTRAINT "entite_nis2_referent_id_personne_id_fk" FOREIGN KEY ("referent_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;