CREATE TYPE "public"."nis2_origine_date_detection" AS ENUM('connaissance', 'detection', 'creation', 'saisie');--> statement-breakpoint
ALTER TABLE "notification_incident_nis2" ADD COLUMN "date_detection_estimee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_incident_nis2" ADD COLUMN "date_detection_origine" "nis2_origine_date_detection";--> statement-breakpoint
-- REPRISE DES SUIVIS EXISTANTS.
--
-- Jusqu'ici, `date_detection` était systématiquement la date de CRÉATION de la fiche côté
-- Sniff, présentée à tort comme la prise de connaissance. Laisser ces lignes à
-- « non estimée » leur ferait affirmer une certitude qu'elles n'ont pas — précisément le
-- défaut que cette migration corrige. On les marque donc pour ce qu'elles sont.
--
-- Le critère est l'origine du suivi : `incident_externe_id` renseigné = importé de Sniff,
-- donc date issue de `createdAt`. NULL = saisi à la main par un humain, qui savait ce
-- qu'il inscrivait.
UPDATE "notification_incident_nis2"
   SET "date_detection_origine" = 'creation',
       "date_detection_estimee" = true
 WHERE "incident_externe_id" IS NOT NULL
   AND "date_detection_origine" IS NULL;--> statement-breakpoint
UPDATE "notification_incident_nis2"
   SET "date_detection_origine" = 'saisie'
 WHERE "incident_externe_id" IS NULL
   AND "date_detection_origine" IS NULL;
