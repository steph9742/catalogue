CREATE TABLE "section_cnu" (
	"id" text PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"intitule" text NOT NULL,
	"groupe" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "section_cnu_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
ALTER TABLE "personne" ADD COLUMN "section_cnu_id" text;--> statement-breakpoint
ALTER TABLE "personne" ADD CONSTRAINT "personne_section_cnu_id_section_cnu_id_fk" FOREIGN KEY ("section_cnu_id") REFERENCES "public"."section_cnu"("id") ON DELETE set null ON UPDATE no action;