CREATE TYPE "public"."rgpd_cible" AS ENUM('nis2', 'iso27001', 'iso27002');--> statement-breakpoint
CREATE TYPE "public"."rgpd_conformite" AS ENUM('conforme', 'partielle', 'non_conforme', 'non_applicable');--> statement-breakpoint
CREATE TYPE "public"."rgpd_statut" AS ENUM('a_faire', 'en_cours', 'fait');--> statement-breakpoint
CREATE TABLE "cadre_referentiel" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"actif" boolean DEFAULT true NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cadre_referentiel_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exigence_rgpd" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"article" integer NOT NULL,
	"intitule_article" text NOT NULL,
	"intitule" text NOT NULL,
	"extrait_texte" text,
	"conformite" "rgpd_conformite",
	"plan" text,
	"echeance" date,
	"statut" "rgpd_statut" DEFAULT 'a_faire' NOT NULL,
	"preuve" text,
	"responsable_id" text,
	"notes" text,
	"ordre" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exigence_rgpd_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "exigence_rgpd_lien" (
	"id" text PRIMARY KEY NOT NULL,
	"exigence_rgpd_id" text NOT NULL,
	"cible" "rgpd_cible" NOT NULL,
	"reference" text NOT NULL,
	"intitule" text,
	"officiel" boolean DEFAULT false NOT NULL,
	"justification" text,
	"valide_le" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exigence_rgpd" ADD CONSTRAINT "exigence_rgpd_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exigence_rgpd_lien" ADD CONSTRAINT "exigence_rgpd_lien_exigence_rgpd_id_exigence_rgpd_id_fk" FOREIGN KEY ("exigence_rgpd_id") REFERENCES "public"."exigence_rgpd"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exigence_rgpd_lien_unique" ON "exigence_rgpd_lien" USING btree ("exigence_rgpd_id","cible","reference");