-- Certificats TLS : inventaire et surveillance des échéances.
--
-- Le moteur d'échéances couvrait les VPN, les fins de support, les contrats et les
-- revues — mais PAS les certificats, c'est-à-dire la seule catégorie dont l'expiration
-- ne dégrade pas le service mais l'ARRÊTE. C'était le trou le plus coûteux du
-- dispositif, et le plus facile à ne jamais voir.
--
-- Aucune date n'est saisie ici : `date_fin` vient du certificat effectivement présenté
-- par le service, relevé par scan. Une date recopiée à la main est fausse dès le premier
-- renouvellement — et une date fausse est pire qu'une absence, parce qu'elle rassure.
--
-- `chaine_valide` est distinct de l'expiration : une chaîne incomplète ou une racine
-- inconnue produit, pour l'utilisateur, exactement le même incident qu'un certificat
-- expiré, mais SANS date. C'est un état, pas une échéance, et il est rapporté comme tel.
CREATE TYPE "public"."certificat_source" AS ENUM('manuel', 'import', 'scan');--> statement-breakpoint
CREATE TYPE "public"."certificat_statut" AS ENUM('jamais', 'ok', 'injoignable', 'tls_erreur', 'invalide');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certificat" (
	"id" text PRIMARY KEY NOT NULL,
	"hote" text NOT NULL,
	"port" integer DEFAULT 443 NOT NULL,
	"libelle" text,
	"proprietaire" text,
	"notes" text,
	"source" "certificat_source" DEFAULT 'manuel' NOT NULL,
	"surveille" boolean DEFAULT true NOT NULL,
	"sujet" text,
	"emetteur" text,
	"noms_alternatifs" jsonb,
	"numero_serie" text,
	"empreinte" text,
	"algorithme" text,
	"date_debut" timestamp,
	"date_fin" timestamp,
	"auto_signe" boolean,
	"chaine_valide" boolean,
	"erreur_validation" text,
	"dernier_scan_at" timestamp,
	"dernier_statut" "certificat_statut" DEFAULT 'jamais' NOT NULL,
	"dernier_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "certificat_hote_port_idx" ON "certificat" USING btree ("hote","port");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "certificat_date_fin_idx" ON "certificat" USING btree ("date_fin");