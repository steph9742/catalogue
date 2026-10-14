CREATE TYPE "public"."audit_dialecte" AS ENUM('contrat', 'artemis');--> statement-breakpoint
ALTER TYPE "public"."constat_categorie" ADD VALUE 'port';--> statement-breakpoint
ALTER TABLE "connecteur_audit" ADD COLUMN "dialecte" "audit_dialecte" DEFAULT 'contrat' NOT NULL;