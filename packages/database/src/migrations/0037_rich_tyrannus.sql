CREATE TYPE "public"."iso27001_conformite" AS ENUM('conforme', 'partielle', 'non_conforme', 'non_applicable');--> statement-breakpoint
CREATE TYPE "public"."iso27001_source_intitule" AS ENUM('officiel', 'traduction');--> statement-breakpoint
CREATE TYPE "public"."iso27001_statut" AS ENUM('a_faire', 'en_cours', 'fait');--> statement-breakpoint
CREATE TABLE "clause_iso27001" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"chapitre" integer NOT NULL,
	"intitule" text NOT NULL,
	"intitule_en" text,
	"source_intitule" "iso27001_source_intitule" DEFAULT 'officiel' NOT NULL,
	"conformite" "iso27001_conformite",
	"plan" text,
	"echeance" date,
	"statut" "iso27001_statut" DEFAULT 'a_faire' NOT NULL,
	"preuve" text,
	"responsable_id" text,
	"notes" text,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clause_iso27001_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "clause_iso27001" ADD CONSTRAINT "clause_iso27001_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;