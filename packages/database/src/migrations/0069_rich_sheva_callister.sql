CREATE TABLE "domaine_surveille" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"note" text,
	"actif" boolean DEFAULT true NOT NULL,
	"dernier_releve_le" timestamp,
	"dernier_statut" "audit_sync_statut" DEFAULT 'jamais' NOT NULL,
	"dernier_message" text,
	"dernier_comptes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domaine_surveille_nom_unique" UNIQUE("nom")
);
