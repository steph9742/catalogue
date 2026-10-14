CREATE TYPE "public"."nis2_action_priorite" AS ENUM('basse', 'moyenne', 'haute', 'critique');--> statement-breakpoint
CREATE TYPE "public"."nis2_action_statut" AS ENUM('a_faire', 'en_cours', 'fait', 'abandonnee');--> statement-breakpoint
CREATE TABLE "action_nis2" (
	"id" text PRIMARY KEY NOT NULL,
	"exigence_nis2_id" text NOT NULL,
	"intitule" text NOT NULL,
	"description" text,
	"statut" "nis2_action_statut" DEFAULT 'a_faire' NOT NULL,
	"priorite" "nis2_action_priorite" DEFAULT 'moyenne' NOT NULL,
	"responsable_id" text,
	"technicien_id" text,
	"echeance" date,
	"date_fait" date,
	"preuve" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_nis2" ADD CONSTRAINT "action_nis2_exigence_nis2_id_exigence_nis2_id_fk" FOREIGN KEY ("exigence_nis2_id") REFERENCES "public"."exigence_nis2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_nis2" ADD CONSTRAINT "action_nis2_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_nis2" ADD CONSTRAINT "action_nis2_technicien_id_personne_id_fk" FOREIGN KEY ("technicien_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;