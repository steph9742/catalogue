-- Connecteur HarfangLab (EDR), en LECTURE SEULE.
--
-- Trois tables : la configuration du connecteur (singleton, jeton chiffré), la copie
-- minimale de la flotte d'agents, et l'instantané quotidien de l'état des moteurs.
--
-- Ce qui est stocké sert à établir DEUX écarts : les machines qui devraient être
-- surveillées et ne le sont pas, et les moteurs qui ont changé d'état sans qu'on l'ait
-- décidé. Rien d'autre — ce n'est pas un miroir de la console.
CREATE TYPE "harfanglab_sync_statut" AS ENUM('jamais', 'ok', 'erreur', 'en_cours');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "connecteur_harfanglab" (
  "id" text PRIMARY KEY NOT NULL,
  "url" text,
  "jeton" text,
  "actif" boolean DEFAULT false NOT NULL,
  "frequence_heures" integer DEFAULT 24 NOT NULL,
  "dernier_sync_at" timestamp,
  "dernier_statut" "harfanglab_sync_statut" DEFAULT 'jamais' NOT NULL,
  "dernier_message" text,
  "dernier_comptes" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "harfanglab_agent" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text NOT NULL,
  "hostname" text,
  "machine_serial" text,
  "hardware_address" text,
  "statut" text,
  "lastseen" timestamp,
  "version" text,
  "ostype" text,
  "politique_id" text,
  "politique_nom" text,
  "modes" jsonb,
  "revisions" jsonb,
  "vu_au_sync" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "harfanglab_agent_agent_id_unique" UNIQUE("agent_id")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "harfanglab_moteur_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "politique_id" text NOT NULL,
  "politique_nom" text,
  "releve_le" timestamp DEFAULT now() NOT NULL,
  "modes" jsonb,
  "revisions" jsonb,
  "changements" jsonb
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "harfanglab_agent_serial_idx" ON "harfanglab_agent" ("machine_serial");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "harfanglab_agent_hostname_idx" ON "harfanglab_agent" ("hostname");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "harfanglab_moteur_politique_idx" ON "harfanglab_moteur_snapshot" ("politique_id", "releve_le");
