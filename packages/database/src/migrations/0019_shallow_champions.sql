CREATE TYPE "public"."glpi_classement" AS ENUM('a_classer', 'serveur', 'poste', 'ignore');--> statement-breakpoint
CREATE TYPE "public"."glpi_sync_statut" AS ENUM('jamais', 'ok', 'erreur', 'en_cours');--> statement-breakpoint
CREATE TABLE "connecteur_glpi" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text,
	"app_token" text,
	"user_token" text,
	"actif" boolean DEFAULT false NOT NULL,
	"frequence_heures" integer DEFAULT 24 NOT NULL,
	"dernier_sync_at" timestamp,
	"dernier_statut" "glpi_sync_statut" DEFAULT 'jamais' NOT NULL,
	"dernier_message" text,
	"dernier_comptes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glpi_machine" (
	"id" text PRIMARY KEY NOT NULL,
	"glpi_id" text NOT NULL,
	"nom" text NOT NULL,
	"os" text,
	"os_version" text,
	"donnees_brutes" jsonb,
	"classement" "glpi_classement" DEFAULT 'a_classer' NOT NULL,
	"classement_manuel" boolean DEFAULT false NOT NULL,
	"cible_id" text,
	"vu_au_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "glpi_machine_glpi_id_unique" UNIQUE("glpi_id")
);
--> statement-breakpoint
CREATE TABLE "connecteur_slowpoke" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text,
	"email" text,
	"mot_de_passe" text,
	"actif" boolean DEFAULT false NOT NULL,
	"dernier_acces_at" timestamp,
	"dernier_statut" text DEFAULT 'jamais' NOT NULL,
	"dernier_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "source_glpi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD COLUMN "source_glpi" boolean DEFAULT false NOT NULL;