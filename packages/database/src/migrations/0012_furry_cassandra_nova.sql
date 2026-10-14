CREATE TYPE "public"."flux_app_frequence" AS ENUM('temps_reel', 'frequent', 'quotidien', 'hebdomadaire', 'ponctuel');--> statement-breakpoint
CREATE TYPE "public"."flux_app_protocole" AS ENUM('https', 'api_rest', 'soap', 'sql', 'ldap', 'smtp', 'fichier', 'message', 'autre');--> statement-breakpoint
CREATE TYPE "public"."flux_app_sens" AS ENUM('unidirectionnel', 'bidirectionnel');--> statement-breakpoint
CREATE TYPE "public"."interconnexion_type" AS ENUM('operateur', 'renater', 'internet', 'partenaire', 'autre');--> statement-breakpoint
CREATE TYPE "public"."lien_reseau_type" AS ENUM('fibre', 'cuivre', 'vlan_trunk', 'sans_fil', 'autre');--> statement-breakpoint
CREATE TABLE "actif_information_application" (
	"id" text PRIMARY KEY NOT NULL,
	"actif_informationnel_id" text NOT NULL,
	"application_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flux_applicatif" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"source_application_id" text,
	"destination_application_id" text,
	"protocole" "flux_app_protocole",
	"port" text,
	"donnees" text,
	"sens" "flux_app_sens",
	"frequence" "flux_app_frequence",
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interconnexion_externe" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "interconnexion_type",
	"fournisseur" text,
	"equipement_id" text,
	"debit" text,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "interconnexion_externe_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "lien_reseau" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text,
	"equipement_a_id" text,
	"equipement_b_id" text,
	"type" "lien_reseau_type",
	"port_a" text,
	"port_b" text,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evenement_redoute" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"actif_primaire_id" text,
	"critere" "propriete_dic",
	"gravite" "risque_gravite",
	"impacts" text,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evenement_redoute_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD COLUMN "evenement_redoute_id" text;--> statement-breakpoint
ALTER TABLE "actif_information_application" ADD CONSTRAINT "actif_information_application_actif_informationnel_id_actif_informationnel_id_fk" FOREIGN KEY ("actif_informationnel_id") REFERENCES "public"."actif_informationnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actif_information_application" ADD CONSTRAINT "actif_information_application_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flux_applicatif" ADD CONSTRAINT "flux_applicatif_source_application_id_application_id_fk" FOREIGN KEY ("source_application_id") REFERENCES "public"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flux_applicatif" ADD CONSTRAINT "flux_applicatif_destination_application_id_application_id_fk" FOREIGN KEY ("destination_application_id") REFERENCES "public"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interconnexion_externe" ADD CONSTRAINT "interconnexion_externe_equipement_id_equipement_reseau_id_fk" FOREIGN KEY ("equipement_id") REFERENCES "public"."equipement_reseau"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_reseau" ADD CONSTRAINT "lien_reseau_equipement_a_id_equipement_reseau_id_fk" FOREIGN KEY ("equipement_a_id") REFERENCES "public"."equipement_reseau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lien_reseau" ADD CONSTRAINT "lien_reseau_equipement_b_id_equipement_reseau_id_fk" FOREIGN KEY ("equipement_b_id") REFERENCES "public"."equipement_reseau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_redoute" ADD CONSTRAINT "evenement_redoute_actif_primaire_id_actif_smsi_id_fk" FOREIGN KEY ("actif_primaire_id") REFERENCES "public"."actif_smsi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actif_info_app_unique" ON "actif_information_application" USING btree ("actif_informationnel_id","application_id");--> statement-breakpoint
ALTER TABLE "risque_smsi" ADD CONSTRAINT "risque_smsi_evenement_redoute_id_evenement_redoute_id_fk" FOREIGN KEY ("evenement_redoute_id") REFERENCES "public"."evenement_redoute"("id") ON DELETE set null ON UPDATE no action;