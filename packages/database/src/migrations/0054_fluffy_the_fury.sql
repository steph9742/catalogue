-- CETTE MIGRATION EST IDEMPOTENTE, ET CE N'EST PAS UN LUXE.
--
-- La migration 0053 avait été écrite À LA MAIN, sans passer par `drizzle-kit generate` :
-- son instantané ne portait donc pas les tables qu'elle créait. En générant 0054, l'outil
-- a comparé le schéma courant à cet instantané périmé et a ré-émis tout ce qu'il croyait
-- manquant — `service_expose`, `service_technologie`, leurs types, et jusqu'à des colonnes
-- de 0052.
--
-- Le déploiement a échoué sur « type detection_certitude already exists », et comme
-- drizzle joue TOUTES les migrations dans une seule transaction, rien n'a été appliqué.
--
-- Plutôt que de retirer à la main ce que je croyais déjà présent — une reconstitution, donc
-- une supposition — chaque énoncé est rendu conditionnel : c'est la BASE qui décide de ce
-- qui existe. Un objet déjà là est ignoré, un objet absent est créé.
--
-- L'instantané de 0054 est, lui, correct : il a été produit depuis le schéma complet. Le
-- problème ne se reproduira donc pas après cette migration.

DO $$ BEGIN
  CREATE TYPE "public"."ldap_sync_statut" AS ENUM('jamais', 'ok', 'erreur', 'en_cours');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."unite_nature" AS ENUM('composante', 'service', 'departement', 'pole', 'laboratoire', 'ignorer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."unite_source" AS ENUM('livree', 'manuelle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."valeur_vue_source" AS ENUM('ldap_composante', 'ldap_labo', 'ldap_service', 'glpi_niveau2', 'glpi_niveau3', 'glpi_niveau4');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."detection_certitude" AS ENUM('certain', 'probable', 'absente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."detection_source" AS ENUM('entete_server', 'entete_powered_by', 'meta_generator', 'chemin_actif', 'manuel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."service_type" AS ENUM('web', 'messagerie', 'annuaire', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connecteur_ldap" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text,
	"bind_dn" text,
	"mot_de_passe" text,
	"base_dn" text DEFAULT 'ou=people,dc=example,dc=org',
	"filtre" text DEFAULT '(|(objectClass=ufcEmploye)(objectClass=ufcAutre))',
	"actif" boolean DEFAULT false NOT NULL,
	"frequence_heures" integer DEFAULT 24 NOT NULL,
	"dernier_sync_at" timestamp,
	"dernier_statut" "ldap_sync_statut" DEFAULT 'jamais' NOT NULL,
	"dernier_message" text,
	"dernier_comptes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "correspondance_unite" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text,
	"nom_glpi" text,
	"nature" "unite_nature" NOT NULL,
	"type_composante" "composante_type",
	"intitule" text NOT NULL,
	"sigle" text,
	"composante_code" text,
	"source" "unite_source" DEFAULT 'manuelle' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unite_vue" (
	"id" text PRIMARY KEY NOT NULL,
	"provenance" "valeur_vue_source" NOT NULL,
	"valeur" text NOT NULL,
	"code" text,
	"effectif" integer DEFAULT 0 NOT NULL,
	"correspondance_id" text,
	"vu_au_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_expose" (
	"id" text PRIMARY KEY NOT NULL,
	"hote" text NOT NULL,
	"port" integer DEFAULT 443 NOT NULL,
	"libelle" text,
	"type" "service_type" DEFAULT 'web' NOT NULL,
	"application_id" text,
	"proprietaire_id" text,
	"surveille" boolean DEFAULT true NOT NULL,
	"notes" text,
	"dernier_scan_at" timestamp,
	"dernier_statut" text,
	"dernier_message" text,
	"code_http" integer,
	"hsts" boolean,
	"csp" boolean,
	"x_frame_options" boolean,
	"referrer_policy" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_technologie" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"produit" text NOT NULL,
	"version" text,
	"technologie_cle" text,
	"technologie_id" text,
	"certitude" "detection_certitude" NOT NULL,
	"source" "detection_source" NOT NULL,
	"detecte_le" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificat" ADD COLUMN IF NOT EXISTS "service_id" text;--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN IF NOT EXISTS "technologie_cle" text;--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN IF NOT EXISTS "derniere_version_branche" text;--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN IF NOT EXISTS "derniere_version_generale" text;--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN IF NOT EXISTS "branche_maintenue" boolean;--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN IF NOT EXISTS "derniere_version_relevee_le" timestamp;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD COLUMN IF NOT EXISTS "technologie_cle" text;--> statement-breakpoint
ALTER TABLE "composante" ADD COLUMN IF NOT EXISTS "code_unite" text;--> statement-breakpoint
ALTER TABLE "composante" ADD COLUMN IF NOT EXISTS "a_rapprocher" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN IF NOT EXISTS "uid_ldap" text;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN IF NOT EXISTS "source_ldap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN IF NOT EXISTS "prefixe_affectation" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "unite_vue" ADD CONSTRAINT "unite_vue_correspondance_id_correspondance_unite_id_fk" FOREIGN KEY ("correspondance_id") REFERENCES "public"."correspondance_unite"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "service_expose" ADD CONSTRAINT "service_expose_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "service_expose" ADD CONSTRAINT "service_expose_proprietaire_id_personne_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "service_technologie" ADD CONSTRAINT "service_technologie_service_id_service_expose_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service_expose"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "service_technologie" ADD CONSTRAINT "service_technologie_technologie_id_technologie_id_fk" FOREIGN KEY ("technologie_id") REFERENCES "public"."technologie"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "correspondance_unite_code_unique" ON "correspondance_unite" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "correspondance_unite_glpi_unique" ON "correspondance_unite" USING btree ("nom_glpi");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unite_vue_unique" ON "unite_vue" USING btree ("provenance","valeur");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unite_vue_correspondance_idx" ON "unite_vue" USING btree ("correspondance_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_expose_hote_port_unique" ON "service_expose" USING btree ("hote","port");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_expose_application_idx" ON "service_expose" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_technologie_unique" ON "service_technologie" USING btree ("service_id","produit");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_technologie_cle_idx" ON "service_technologie" USING btree ("technologie_cle");--> statement-breakpoint

-- Le référentiel des unités (table « correspondance_unite ») est propre à chaque
-- établissement : il se remplit depuis l'interface, ou par import. Aucune donnée
-- d'organisation n'est livrée avec l'outil.
