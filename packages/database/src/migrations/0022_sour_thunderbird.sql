CREATE TYPE "public"."appareil_mobile_categorie" AS ENUM('tablette', 'smartphone', 'liseuse', 'autre');--> statement-breakpoint
ALTER TYPE "public"."glpi_classement" ADD VALUE 'appareil_mobile' BEFORE 'ignore';--> statement-breakpoint
ALTER TYPE "public"."glpi_classement" ADD VALUE 'iot' BEFORE 'ignore';--> statement-breakpoint
CREATE TABLE "appareil_mobile" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"categorie" "appareil_mobile_categorie",
	"type" text,
	"marque" text,
	"modele" text,
	"numero_serie" text,
	"os" text,
	"os_version" text,
	"ip" text,
	"adresse_mac" text,
	"localisation" text,
	"lieu_id" text,
	"composante_id" text,
	"utilisateur_principal_id" text,
	"criticite" "app_criticite",
	"statut" "materiel_statut" DEFAULT 'actif' NOT NULL,
	"notes" text,
	"source_glpi" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appareil_mobile_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
ALTER TABLE "actif_informationnel" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "glpi_machine" ADD COLUMN "entite" text;--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "lieu" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "iot" ADD COLUMN "os" text;--> statement-breakpoint
ALTER TABLE "iot" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "iot" ADD COLUMN "source_glpi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "equipement_reseau" ADD COLUMN "composante_id" text;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ADD CONSTRAINT "appareil_mobile_lieu_id_lieu_id_fk" FOREIGN KEY ("lieu_id") REFERENCES "public"."lieu"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ADD CONSTRAINT "appareil_mobile_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ADD CONSTRAINT "appareil_mobile_utilisateur_principal_id_personne_id_fk" FOREIGN KEY ("utilisateur_principal_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actif_informationnel" ADD CONSTRAINT "actif_informationnel_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serveur" ADD CONSTRAINT "serveur_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lieu" ADD CONSTRAINT "lieu_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot" ADD CONSTRAINT "iot_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD CONSTRAINT "machine_indus_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD CONSTRAINT "poste_travail_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipement_reseau" ADD CONSTRAINT "equipement_reseau_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE set null ON UPDATE no action;