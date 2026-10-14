CREATE TYPE "public"."actif_smsi_type" AS ENUM('serveur', 'application', 'poste-travail', 'iot', 'machine-indus', 'equipement-reseau', 'actif-informationnel', 'processus', 'personne', 'lieu', 'autre');--> statement-breakpoint
CREATE TYPE "public"."mesure_statut" AS ENUM('a_faire', 'en_cours', 'mise_en_oeuvre', 'a_ameliorer');--> statement-breakpoint
CREATE TYPE "public"."mesure_theme" AS ENUM('organisationnelles', 'personnes', 'physiques', 'technologiques');--> statement-breakpoint
CREATE TYPE "public"."niveau_besoin" AS ENUM('faible', 'modere', 'eleve', 'critique');--> statement-breakpoint
CREATE TYPE "public"."risque_gravite" AS ENUM('mineure', 'significative', 'grave', 'critique');--> statement-breakpoint
CREATE TYPE "public"."risque_statut" AS ENUM('identifie', 'evalue', 'en_traitement', 'traite', 'accepte');--> statement-breakpoint
CREATE TYPE "public"."risque_traitement" AS ENUM('reduire', 'accepter', 'transferer', 'eviter');--> statement-breakpoint
CREATE TYPE "public"."risque_vraisemblance" AS ENUM('rare', 'possible', 'probable', 'quasi_certain');--> statement-breakpoint
CREATE TABLE "actif_smsi" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type_source" "actif_smsi_type",
	"source_id" text,
	"perimetre_smsi" boolean DEFAULT true NOT NULL,
	"disponibilite" "niveau_besoin",
	"integrite" "niveau_besoin",
	"confidentialite" "niveau_besoin",
	"proprietaire_id" text,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "actif_smsi_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "mesure_smsi" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"intitule" text NOT NULL,
	"theme" "mesure_theme",
	"applicable" boolean DEFAULT true NOT NULL,
	"justification" text,
	"statut" "mesure_statut" DEFAULT 'a_faire' NOT NULL,
	"preuve" text,
	"responsable_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mesure_smsi_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "risque_smsi" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"actif_smsi_id" text,
	"menace" text,
	"vulnerabilite" text,
	"vraisemblance" "risque_vraisemblance",
	"gravite" "risque_gravite",
	"traitement" "risque_traitement",
	"statut" "risque_statut" DEFAULT 'identifie' NOT NULL,
	"proprietaire_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actif_smsi" ADD CONSTRAINT "actif_smsi_proprietaire_id_personne_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesure_smsi" ADD CONSTRAINT "mesure_smsi_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD CONSTRAINT "risque_smsi_actif_smsi_id_actif_smsi_id_fk" FOREIGN KEY ("actif_smsi_id") REFERENCES "public"."actif_smsi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD CONSTRAINT "risque_smsi_proprietaire_id_personne_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;