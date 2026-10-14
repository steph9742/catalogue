CREATE TYPE "public"."source_eol_type" AS ENUM('manuel', 'api', 'interne');--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN "fin_de_vie_etendue" date;--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN "source_eol" "source_eol_type";