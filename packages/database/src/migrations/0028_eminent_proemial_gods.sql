ALTER TABLE "actif_informationnel" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "glpi_machine" ADD COLUMN "lieu" text;--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "lieu" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "iot" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "departement" ADD COLUMN "source_glpi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "equipement_reseau" ADD COLUMN "departement_id" text;--> statement-breakpoint
ALTER TABLE "actif_informationnel" ADD CONSTRAINT "actif_informationnel_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serveur" ADD CONSTRAINT "serveur_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lieu" ADD CONSTRAINT "lieu_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ADD CONSTRAINT "appareil_mobile_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot" ADD CONSTRAINT "iot_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD CONSTRAINT "machine_indus_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD CONSTRAINT "poste_travail_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipement_reseau" ADD CONSTRAINT "equipement_reseau_departement_id_departement_id_fk" FOREIGN KEY ("departement_id") REFERENCES "public"."departement"("id") ON DELETE set null ON UPDATE no action;