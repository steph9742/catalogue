CREATE TYPE "public"."service_classement" AS ENUM('paiement', 'sensible', 'standard');--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "contact_technique_id" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "tiers_id" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "serveur_id" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "criticite" "app_criticite";--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "justification_exposition" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "date_revue" date;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "derniere_revue_le" timestamp;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "derniere_revue_par" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "paiement_en_ligne" boolean;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "donnees_personnelles" boolean;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "classement" "service_classement";--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "classement_valide_par" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "classement_valide_le" timestamp;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "classement_propose" "service_classement";--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "classement_preuve" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "classement_propose_le" timestamp;--> statement-breakpoint
ALTER TABLE "service_expose" ADD CONSTRAINT "service_expose_contact_technique_id_personne_id_fk" FOREIGN KEY ("contact_technique_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_expose" ADD CONSTRAINT "service_expose_tiers_id_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_expose" ADD CONSTRAINT "service_expose_serveur_id_serveur_id_fk" FOREIGN KEY ("serveur_id") REFERENCES "public"."serveur"("id") ON DELETE set null ON UPDATE no action;