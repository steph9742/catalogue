CREATE TYPE "public"."page_cible_nature" AS ENUM('paiement', 'panier', 'connexion', 'donnees_personnelles', 'autre');--> statement-breakpoint
CREATE TYPE "public"."script_role" AS ENUM('reference', 'observe');--> statement-breakpoint
CREATE TABLE "page_cible" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"url" text NOT NULL,
	"nature" "page_cible_nature" DEFAULT 'autre' NOT NULL,
	"notes" text,
	"dernier_releve_le" timestamp,
	"csp" text,
	"reference_validee_le" timestamp,
	"reference_validee_par" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_page" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"role" "script_role" NOT NULL,
	"src" text,
	"domaine" text,
	"externe" boolean NOT NULL,
	"sha256" text NOT NULL,
	"integrity" boolean,
	"releve_le" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_cible" ADD CONSTRAINT "page_cible_service_id_service_expose_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service_expose"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_page" ADD CONSTRAINT "script_page_page_id_page_cible_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page_cible"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_cible_service_url_unique" ON "page_cible" USING btree ("service_id","url");--> statement-breakpoint
CREATE INDEX "script_page_page_role_idx" ON "script_page" USING btree ("page_id","role");