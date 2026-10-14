CREATE TYPE "public"."competence_domaine" AS ENUM('technique', 'gouvernance', 'juridique', 'gestion_de_projet', 'sensibilisation', 'autre');--> statement-breakpoint
CREATE TYPE "public"."competence_niveau" AS ENUM('notion', 'intermediaire', 'confirme', 'expert');--> statement-breakpoint
CREATE TYPE "public"."exigence_legale_conformite" AS ENUM('conforme', 'partiellement', 'non_conforme', 'a_evaluer');--> statement-breakpoint
CREATE TYPE "public"."exigence_legale_type" AS ENUM('loi', 'reglement', 'directive', 'contrat', 'norme', 'autre');--> statement-breakpoint
CREATE TYPE "public"."niveau_influence" AS ENUM('faible', 'moyenne', 'forte');--> statement-breakpoint
CREATE TYPE "public"."opportunite_gain" AS ENUM('faible', 'modere', 'eleve', 'majeur');--> statement-breakpoint
CREATE TYPE "public"."opportunite_statut" AS ENUM('identifiee', 'evaluee', 'en_cours', 'realisee', 'abandonnee');--> statement-breakpoint
CREATE TYPE "public"."partie_interessee_categorie" AS ENUM('autorite', 'usager', 'personnel', 'fournisseur', 'partenaire', 'financeur', 'syndicat', 'autre');--> statement-breakpoint
CREATE TYPE "public"."partie_interessee_type" AS ENUM('interne', 'externe');--> statement-breakpoint
CREATE TABLE "competence" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"domaine" "competence_domaine",
	"description" text,
	"niveau_requis" "competence_niveau",
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competence_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "exigence_legale" (
	"id" text PRIMARY KEY NOT NULL,
	"intitule" text NOT NULL,
	"type" "exigence_legale_type",
	"reference" text,
	"source" text,
	"applicabilite" text,
	"conformite" "exigence_legale_conformite",
	"responsable_id" text,
	"date_revue" date,
	"lien" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exigence_legale_intitule_unique" UNIQUE("intitule")
);
--> statement-breakpoint
CREATE TABLE "opportunite" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"origine" text,
	"benefice" text,
	"vraisemblance" "risque_vraisemblance",
	"gain" "opportunite_gain",
	"statut" "opportunite_statut" DEFAULT 'identifiee' NOT NULL,
	"responsable_id" text,
	"echeance" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opportunite_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "partie_interessee" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "partie_interessee_type",
	"categorie" "partie_interessee_categorie",
	"attentes" text,
	"reponse" text,
	"influence" "niveau_influence",
	"contact_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partie_interessee_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "personne_competence" (
	"id" text PRIMARY KEY NOT NULL,
	"personne_id" text NOT NULL,
	"competence_id" text NOT NULL,
	"niveau" "competence_niveau",
	"date_evaluation" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exigence_legale" ADD CONSTRAINT "exigence_legale_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunite" ADD CONSTRAINT "opportunite_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partie_interessee" ADD CONSTRAINT "partie_interessee_contact_id_personne_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personne_competence" ADD CONSTRAINT "personne_competence_personne_id_personne_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personne"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personne_competence" ADD CONSTRAINT "personne_competence_competence_id_competence_id_fk" FOREIGN KEY ("competence_id") REFERENCES "public"."competence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personne_competence_unique" ON "personne_competence" USING btree ("personne_id","competence_id");