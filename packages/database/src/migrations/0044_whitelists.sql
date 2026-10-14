-- Inventaire unifié des listes blanches (HarfangLab + Sniff).
--
-- La validité court depuis la date de création DE LA SOURCE, jamais depuis l'import :
-- une règle posée il y a trois ans ne devient pas neuve parce qu'on vient de la
-- découvrir. C'est exactement ce que cet inventaire doit révéler.
--
-- L'échéance n'est PAS stockée : elle se calcule (`date_revision` ou `date_creation`,
-- plus un an). Une colonne stockée se désynchroniserait à la première prolongation.
CREATE TYPE "whitelist_source" AS ENUM('harfanglab', 'sniff', 'les_deux');--> statement-breakpoint
CREATE TYPE "whitelist_certitude" AS ENUM('certain', 'probable');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "whitelist" (
  "id" text PRIMARY KEY NOT NULL,
  "source" "whitelist_source" NOT NULL,
  "harfanglab_id" text,
  "sniff_exclusion_id" text,
  "sniff_incident_id" text,
  "certitude_rapprochement" "whitelist_certitude",
  "libelle" text NOT NULL,
  "criteres" jsonb,
  "cible" text,
  "regle_sigma" text,
  "regle_correlation" text,
  "motif" text,
  "active" boolean DEFAULT true NOT NULL,
  "date_creation" timestamp NOT NULL,
  "date_revision" timestamp,
  "prolongations" integer DEFAULT 0 NOT NULL,
  "date_expiration_outil" timestamp,
  "vue_au_sync" boolean DEFAULT true NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "whitelist_harfanglab_idx" ON "whitelist" ("harfanglab_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whitelist_sniff_idx" ON "whitelist" ("sniff_exclusion_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whitelist_creation_idx" ON "whitelist" ("date_creation");
