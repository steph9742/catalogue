CREATE TYPE "public"."audit_statut" AS ENUM('planifie', 'en_cours', 'realise', 'cloture');--> statement-breakpoint
CREATE TYPE "public"."audit_type" AS ENUM('interne', 'externe', 'certification');--> statement-breakpoint
CREATE TYPE "public"."document_statut" AS ENUM('brouillon', 'en_validation', 'valide', 'en_revision', 'obsolete');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('politique', 'procedure', 'instruction', 'enregistrement', 'guide', 'autre');--> statement-breakpoint
CREATE TYPE "public"."nc_gravite" AS ENUM('mineure', 'majeure');--> statement-breakpoint
CREATE TYPE "public"."nc_source" AS ENUM('audit', 'incident', 'revue', 'veille', 'autre');--> statement-breakpoint
CREATE TYPE "public"."nc_statut" AS ENUM('ouverte', 'en_cours', 'close');--> statement-breakpoint
CREATE TYPE "public"."nc_type" AS ENUM('non_conformite', 'action_amelioration');--> statement-breakpoint
CREATE TYPE "public"."objectif_statut" AS ENUM('a_faire', 'en_cours', 'atteint', 'abandonne');--> statement-breakpoint
CREATE TYPE "public"."revue_statut" AS ENUM('planifiee', 'realisee');--> statement-breakpoint
CREATE TABLE "risque_mesure" (
	"id" text PRIMARY KEY NOT NULL,
	"risque_smsi_id" text NOT NULL,
	"mesure_smsi_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_smsi" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "audit_type",
	"perimetre" text,
	"date_debut" date,
	"date_fin" date,
	"auditeur" text,
	"statut" "audit_statut" DEFAULT 'planifie' NOT NULL,
	"conclusions" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_smsi_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "document_smsi" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "document_type",
	"version" text,
	"statut" "document_statut" DEFAULT 'brouillon' NOT NULL,
	"date_revue" date,
	"responsable_id" text,
	"lien" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_smsi_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "non_conformite" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"source" "nc_source",
	"type" "nc_type" DEFAULT 'non_conformite' NOT NULL,
	"description" text,
	"gravite" "nc_gravite",
	"responsable_id" text,
	"echeance" date,
	"statut" "nc_statut" DEFAULT 'ouverte' NOT NULL,
	"efficacite_verifiee" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "non_conformite_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "objectif_smsi" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"indicateur" text,
	"cible" text,
	"echeance" date,
	"statut" "objectif_statut" DEFAULT 'a_faire' NOT NULL,
	"avancement" integer,
	"responsable_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "objectif_smsi_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "revue_direction" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"date" date,
	"participants" text,
	"decisions" text,
	"statut" "revue_statut" DEFAULT 'planifiee' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "revue_direction_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
ALTER TABLE "mesure_smsi" ADD COLUMN "proprietes" text;--> statement-breakpoint
ALTER TABLE "mesure_smsi" ADD COLUMN "concepts_cyber" text;--> statement-breakpoint
ALTER TABLE "mesure_smsi" ADD COLUMN "capacites" text;--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD COLUMN "vraisemblance_residuelle" "risque_vraisemblance";--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD COLUMN "gravite_residuelle" "risque_gravite";--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD COLUMN "risque_accepte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "risque_mesure" ADD CONSTRAINT "risque_mesure_risque_smsi_id_risque_smsi_id_fk" FOREIGN KEY ("risque_smsi_id") REFERENCES "public"."risque_smsi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risque_mesure" ADD CONSTRAINT "risque_mesure_mesure_smsi_id_mesure_smsi_id_fk" FOREIGN KEY ("mesure_smsi_id") REFERENCES "public"."mesure_smsi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_smsi" ADD CONSTRAINT "document_smsi_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformite" ADD CONSTRAINT "non_conformite_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectif_smsi" ADD CONSTRAINT "objectif_smsi_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "risque_mesure_unique" ON "risque_mesure" USING btree ("risque_smsi_id","mesure_smsi_id");