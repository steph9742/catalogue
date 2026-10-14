CREATE TYPE "public"."aipd_conclusion" AS ENUM('risque_acceptable', 'acceptable_sous_reserve', 'risque_eleve_consultation', 'traitement_modifie');--> statement-breakpoint
CREATE TYPE "public"."aipd_motif" AS ENUM('evaluation_scoring', 'decision_automatisee', 'surveillance_systematique', 'donnees_sensibles', 'grande_echelle', 'croisement_donnees', 'personnes_vulnerables', 'usage_innovant', 'liste_cnil', 'autre');--> statement-breakpoint
CREATE TYPE "public"."aipd_statut" AS ENUM('non_requise', 'a_faire', 'en_cours', 'terminee');--> statement-breakpoint
CREATE TYPE "public"."etat_exigence_application" AS ENUM('conforme', 'non_conforme', 'non_applicable');--> statement-breakpoint
CREATE TYPE "public"."rgpd_portee" AS ENUM('etablissement', 'application', 'les_deux');--> statement-breakpoint
CREATE TABLE "application_exigence_rgpd" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"exigence_rgpd_id" text NOT NULL,
	"etat" "etat_exigence_application" NOT NULL,
	"justification" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_rgpd" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"aipd_statut" "aipd_statut" DEFAULT 'non_requise' NOT NULL,
	"aipd_motif" "aipd_motif",
	"aipd_motif_precision" text,
	"aipd_conclusion" "aipd_conclusion",
	"aipd_conclusion_detail" text,
	"aipd_date" date,
	"aipd_revue_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_rgpd_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
ALTER TABLE "exigence_rgpd" ADD COLUMN "portee" "rgpd_portee" DEFAULT 'etablissement' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_exigence_rgpd" ADD CONSTRAINT "application_exigence_rgpd_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_exigence_rgpd" ADD CONSTRAINT "application_exigence_rgpd_exigence_rgpd_id_exigence_rgpd_id_fk" FOREIGN KEY ("exigence_rgpd_id") REFERENCES "public"."exigence_rgpd"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_rgpd" ADD CONSTRAINT "application_rgpd_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_exigence_rgpd_unique" ON "application_exigence_rgpd" USING btree ("application_id","exigence_rgpd_id");