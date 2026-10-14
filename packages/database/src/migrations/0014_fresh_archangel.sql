CREATE TYPE "public"."nis2_applicabilite" AS ENUM('ei_ee', 'ee');--> statement-breakpoint
CREATE TYPE "public"."nis2_conformite" AS ENUM('fait', 'partiellement', 'tres_partiellement', 'pas_du_tout');--> statement-breakpoint
CREATE TYPE "public"."nis2_domaine" AS ENUM('gouvernance', 'protection', 'defense', 'resilience');--> statement-breakpoint
CREATE TYPE "public"."nis2_role_responsable" AS ENUM('implementation', 'technique');--> statement-breakpoint
CREATE TYPE "public"."nis2_statut" AS ENUM('a_faire', 'en_cours', 'fait', 'non_applicable');--> statement-breakpoint
CREATE TABLE "exigence_nis2" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"objectif_nis2_id" text,
	"sous_section" text,
	"intitule" text NOT NULL,
	"attendu_ei" boolean DEFAULT false NOT NULL,
	"attendu_ee" boolean DEFAULT true NOT NULL,
	"conformite" "nis2_conformite",
	"plan" text,
	"echeance" date,
	"statut" "nis2_statut" DEFAULT 'a_faire' NOT NULL,
	"preuve" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exigence_nis2_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "exigence_nis2_mesure" (
	"id" text PRIMARY KEY NOT NULL,
	"exigence_nis2_id" text NOT NULL,
	"mesure_smsi_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exigence_nis2_responsable" (
	"id" text PRIMARY KEY NOT NULL,
	"exigence_nis2_id" text NOT NULL,
	"personne_id" text NOT NULL,
	"role" "nis2_role_responsable" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectif_nis2" (
	"id" text PRIMARY KEY NOT NULL,
	"numero" integer NOT NULL,
	"intitule" text NOT NULL,
	"domaine" "nis2_domaine",
	"applicabilite" "nis2_applicabilite" DEFAULT 'ei_ee' NOT NULL,
	"rappel" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "objectif_nis2_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
ALTER TABLE "exigence_nis2" ADD CONSTRAINT "exigence_nis2_objectif_nis2_id_objectif_nis2_id_fk" FOREIGN KEY ("objectif_nis2_id") REFERENCES "public"."objectif_nis2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exigence_nis2_mesure" ADD CONSTRAINT "exigence_nis2_mesure_exigence_nis2_id_exigence_nis2_id_fk" FOREIGN KEY ("exigence_nis2_id") REFERENCES "public"."exigence_nis2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exigence_nis2_mesure" ADD CONSTRAINT "exigence_nis2_mesure_mesure_smsi_id_mesure_smsi_id_fk" FOREIGN KEY ("mesure_smsi_id") REFERENCES "public"."mesure_smsi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exigence_nis2_responsable" ADD CONSTRAINT "exigence_nis2_responsable_exigence_nis2_id_exigence_nis2_id_fk" FOREIGN KEY ("exigence_nis2_id") REFERENCES "public"."exigence_nis2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exigence_nis2_responsable" ADD CONSTRAINT "exigence_nis2_responsable_personne_id_personne_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personne"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exigence_nis2_mesure_unique" ON "exigence_nis2_mesure" USING btree ("exigence_nis2_id","mesure_smsi_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exigence_nis2_responsable_unique" ON "exigence_nis2_responsable" USING btree ("exigence_nis2_id","personne_id","role");