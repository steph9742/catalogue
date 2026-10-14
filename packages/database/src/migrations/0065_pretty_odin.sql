ALTER TABLE "service_expose" ADD COLUMN "verification_interieure_le" timestamp;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "verification_interieure_par" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "verification_interieure_methode" text;--> statement-breakpoint
ALTER TABLE "service_expose" ADD COLUMN "verification_interieure_note" text;--> statement-breakpoint
ALTER TABLE "constat" ADD COLUMN "sniff_incident_id" text;--> statement-breakpoint
ALTER TABLE "constat" ADD COLUMN "incident_lie_par" text;--> statement-breakpoint
ALTER TABLE "constat" ADD COLUMN "incident_lie_le" timestamp;