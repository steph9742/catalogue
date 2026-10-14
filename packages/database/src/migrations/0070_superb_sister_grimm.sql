ALTER TABLE "domaine_surveille" ADD COLUMN "serveur_dns" text;--> statement-breakpoint
ALTER TABLE "domaine_surveille" ADD COLUMN "tsig_nom" text;--> statement-breakpoint
ALTER TABLE "domaine_surveille" ADD COLUMN "tsig_algorithme" text;--> statement-breakpoint
ALTER TABLE "domaine_surveille" ADD COLUMN "tsig_secret" text;