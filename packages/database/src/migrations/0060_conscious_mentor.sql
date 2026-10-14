CREATE TABLE "releve_actif" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"releve_le" timestamp DEFAULT now() NOT NULL,
	"statut" text NOT NULL,
	"message" text,
	"code_http" integer,
	"technologies" jsonb,
	"en_tetes" jsonb,
	"certificat_statut" text,
	"certificat_empreinte" text,
	"certificat_date_fin" timestamp,
	"scripts" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "releve_actif" ADD CONSTRAINT "releve_actif_service_id_service_expose_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service_expose"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "releve_actif_service_date_idx" ON "releve_actif" USING btree ("service_id","releve_le");--> statement-breakpoint
CREATE INDEX "releve_actif_date_idx" ON "releve_actif" USING btree ("releve_le");