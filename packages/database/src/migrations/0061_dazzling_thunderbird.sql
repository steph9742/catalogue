CREATE TYPE "public"."audit_sync_statut" AS ENUM('jamais', 'ok', 'erreur', 'en_cours');--> statement-breakpoint
CREATE TYPE "public"."constat_categorie" AS ENUM('certificat', 'tls', 'entete', 'fichier_expose', 'outil_expose', 'version', 'vulnerabilite', 'dns', 'reputation', 'integrite_script', 'compromission', 'classement', 'decouverte');--> statement-breakpoint
CREATE TYPE "public"."constat_gravite" AS ENUM('critique', 'elevee', 'moyenne', 'faible', 'info');--> statement-breakpoint
CREATE TYPE "public"."constat_statut" AS ENUM('ouvert', 'accepte', 'corrige', 'reteste');--> statement-breakpoint
CREATE TYPE "public"."decouverte_traitement" AS ENUM('a_valider', 'inscrit', 'ecarte', 'deja_inventorie');--> statement-breakpoint
CREATE TABLE "connecteur_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text,
	"jeton" text,
	"actif" boolean DEFAULT false NOT NULL,
	"frequence_heures" integer DEFAULT 24 NOT NULL,
	"domaines" jsonb,
	"plages" jsonb,
	"curseur" timestamp,
	"dernier_sync_at" timestamp,
	"dernier_statut" "audit_sync_statut" DEFAULT 'jamais' NOT NULL,
	"dernier_message" text,
	"dernier_comptes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "constat" (
	"id" text PRIMARY KEY NOT NULL,
	"cle_stable" text NOT NULL,
	"actif_hote" text NOT NULL,
	"actif_port" integer,
	"actif_url" text,
	"service_id" text,
	"categorie" "constat_categorie" NOT NULL,
	"gravite" "constat_gravite" NOT NULL,
	"titre" text NOT NULL,
	"detail" text,
	"preuve" text,
	"reference" text,
	"premier_releve_le" timestamp NOT NULL,
	"dernier_releve_le" timestamp NOT NULL,
	"observations" integer DEFAULT 1 NOT NULL,
	"statut" "constat_statut" DEFAULT 'ouvert' NOT NULL,
	"acceptation_motif" text,
	"acceptation_echeance" date,
	"corrige_le" timestamp,
	"reteste_le" timestamp,
	"reouvert_le" timestamp,
	"decision_par" text,
	"decision_le" timestamp,
	"traitement" "decouverte_traitement",
	"traitement_motif" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "constat" ADD CONSTRAINT "constat_service_id_service_expose_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service_expose"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "constat_cle_stable_unique" ON "constat" USING btree ("cle_stable");--> statement-breakpoint
CREATE INDEX "constat_statut_idx" ON "constat" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "constat_service_idx" ON "constat" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "constat_categorie_idx" ON "constat" USING btree ("categorie");