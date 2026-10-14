CREATE TYPE "public"."entite_role_type" AS ENUM('president', 'vice_president', 'chef_cabinet', 'secretaire_cabinet', 'dgs', 'dga');--> statement-breakpoint
CREATE TABLE "entite_responsable" (
	"id" text PRIMARY KEY NOT NULL,
	"entite_id" text NOT NULL,
	"personne_id" text NOT NULL,
	"role" "entite_role_type" NOT NULL,
	"ordre" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entite_responsable" ADD CONSTRAINT "entite_responsable_entite_id_entite_id_fk" FOREIGN KEY ("entite_id") REFERENCES "public"."entite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entite_responsable" ADD CONSTRAINT "entite_responsable_personne_id_personne_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personne"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entite_responsable_unique" ON "entite_responsable" USING btree ("entite_id","personne_id","role");