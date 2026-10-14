ALTER TYPE "public"."notification_nis2_statut" ADD VALUE 'non_applicable';--> statement-breakpoint
ALTER TABLE "connecteur_slowpoke" ADD COLUMN "auto_notifier" boolean DEFAULT true NOT NULL;