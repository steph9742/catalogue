CREATE TYPE "public"."mesure_type" AS ENUM('preventive', 'detective', 'corrective');--> statement-breakpoint
CREATE TABLE "risque_actif" (
	"id" text PRIMARY KEY NOT NULL,
	"risque_smsi_id" text NOT NULL,
	"actif_smsi_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mesure_smsi" ADD COLUMN "type_mesure" "mesure_type";--> statement-breakpoint
ALTER TABLE "mesure_smsi" ADD COLUMN "objectif" text;--> statement-breakpoint
ALTER TABLE "mesure_smsi" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "risque_actif" ADD CONSTRAINT "risque_actif_risque_smsi_id_risque_smsi_id_fk" FOREIGN KEY ("risque_smsi_id") REFERENCES "public"."risque_smsi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risque_actif" ADD CONSTRAINT "risque_actif_actif_smsi_id_actif_smsi_id_fk" FOREIGN KEY ("actif_smsi_id") REFERENCES "public"."actif_smsi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "risque_actif_unique" ON "risque_actif" USING btree ("risque_smsi_id","actif_smsi_id");