CREATE TYPE "public"."annulation_lot_type" AS ENUM('modification', 'suppression');--> statement-breakpoint
CREATE TABLE "annulation_lot" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"type" "annulation_lot_type" NOT NULL,
	"contenu" jsonb NOT NULL,
	"lignes" text NOT NULL,
	"cree_par" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
