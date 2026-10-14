CREATE TYPE "public"."partie_prenante_type" AS ENUM('fournisseur', 'prestataire_it', 'partenaire', 'client', 'filiale', 'entite_interne', 'autre');--> statement-breakpoint
CREATE TYPE "public"."source_risque_categorie" AS ENUM('etatique', 'crime_organise', 'terroriste', 'ideologue_hacktiviste', 'officine_privee', 'amateur', 'vengeur', 'malveillant_interne', 'concurrent', 'autre');--> statement-breakpoint
CREATE TYPE "public"."source_risque_pertinence" AS ENUM('ecartee', 'a_surveiller', 'retenue');--> statement-breakpoint
CREATE TYPE "public"."notification_nis2_statut" AS ENUM('ouverte', 'en_cours', 'close');--> statement-breakpoint
CREATE TABLE "partie_prenante" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "partie_prenante_type",
	"dependance" integer,
	"penetration" integer,
	"maturite_cyber" integer,
	"confiance" integer,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partie_prenante_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "scenario_operationnel" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"scenario_strategique_id" text NOT NULL,
	"bien_support_id" text,
	"vraisemblance" "risque_vraisemblance",
	"sequence" text,
	"mode_operatoire" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_operationnel_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "scenario_strategique" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"source_risque_id" text,
	"evenement_redoute_id" text,
	"partie_prenante_id" text,
	"gravite" "risque_gravite",
	"chemin_attaque" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_strategique_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "source_risque" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"categorie" "source_risque_categorie",
	"objectif_vise" text,
	"motivation" integer,
	"ressources" integer,
	"activite" integer,
	"pertinence" "source_risque_pertinence",
	"justification" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "source_risque_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "notification_incident_nis2" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_externe_id" text,
	"libelle" text NOT NULL,
	"gravite" text,
	"significatif" boolean DEFAULT true NOT NULL,
	"date_detection" timestamp NOT NULL,
	"alerte_precoce_at" timestamp,
	"alerte_precoce_ref" text,
	"notification_at" timestamp,
	"notification_ref" text,
	"rapport_final_at" timestamp,
	"rapport_final_ref" text,
	"statut" "notification_nis2_statut" DEFAULT 'ouverte' NOT NULL,
	"referent_id" text,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenario_operationnel" ADD CONSTRAINT "scenario_operationnel_scenario_strategique_id_scenario_strategique_id_fk" FOREIGN KEY ("scenario_strategique_id") REFERENCES "public"."scenario_strategique"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_operationnel" ADD CONSTRAINT "scenario_operationnel_bien_support_id_actif_smsi_id_fk" FOREIGN KEY ("bien_support_id") REFERENCES "public"."actif_smsi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_strategique" ADD CONSTRAINT "scenario_strategique_source_risque_id_source_risque_id_fk" FOREIGN KEY ("source_risque_id") REFERENCES "public"."source_risque"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_strategique" ADD CONSTRAINT "scenario_strategique_evenement_redoute_id_evenement_redoute_id_fk" FOREIGN KEY ("evenement_redoute_id") REFERENCES "public"."evenement_redoute"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_strategique" ADD CONSTRAINT "scenario_strategique_partie_prenante_id_partie_prenante_id_fk" FOREIGN KEY ("partie_prenante_id") REFERENCES "public"."partie_prenante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_incident_nis2" ADD CONSTRAINT "notification_incident_nis2_referent_id_personne_id_fk" FOREIGN KEY ("referent_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;