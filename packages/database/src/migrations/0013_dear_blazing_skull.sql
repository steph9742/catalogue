CREATE TYPE "public"."lien_reseau_portee" AS ENUM('local', 'man');--> statement-breakpoint
ALTER TABLE "lien_reseau" ADD COLUMN "portee" "lien_reseau_portee";--> statement-breakpoint
ALTER TABLE "lien_reseau" ADD COLUMN "debit" text;