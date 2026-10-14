CREATE TYPE "public"."composante_referent_role" AS ENUM('informaticien_proximite', 'cssi');--> statement-breakpoint
CREATE TABLE "composante_referent" (
	"id" text PRIMARY KEY NOT NULL,
	"composante_id" text NOT NULL,
	"personne_id" text NOT NULL,
	"role" "composante_referent_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actif_informationnel" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "lieu" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "lieu" ADD COLUMN "source_glpi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lieu" ADD COLUMN "chemin_glpi" text;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "iot" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "composante" ADD COLUMN "source_glpi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "source_glpi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "equipement_reseau" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "composante_referent" ADD CONSTRAINT "composante_referent_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composante_referent" ADD CONSTRAINT "composante_referent_personne_id_personne_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personne"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "composante_referent_unique" ON "composante_referent" USING btree ("composante_id","personne_id","role");--> statement-breakpoint
ALTER TABLE "actif_informationnel" ADD CONSTRAINT "actif_informationnel_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serveur" ADD CONSTRAINT "serveur_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lieu" ADD CONSTRAINT "lieu_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ADD CONSTRAINT "appareil_mobile_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot" ADD CONSTRAINT "iot_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD CONSTRAINT "machine_indus_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD CONSTRAINT "poste_travail_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipement_reseau" ADD CONSTRAINT "equipement_reseau_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;