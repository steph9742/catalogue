-- MIGRATION REPRISE À LA MAIN.
--
-- drizzle-kit a engendré une version qui échouait à l'exécution, sur trois points :
--
--  1. Elle convertissait `serveur.criticite` en texte AVANT de créer la colonne (ajoutée
--     plus bas dans le même fichier). `ALTER COLUMN` sur une colonne inexistante s'arrête
--     en erreur. La colonne étant neuve, elle n'a besoin d'aucune conversion.
--
--  2. Elle supprimait le type `app_criticite` alors que `machine_indus.criticite_surete`
--     s'en servait encore. PostgreSQL refuse de supprimer un type référencé. La sûreté de
--     fonctionnement est donc détachée EN PREMIER, vers sa propre énumération.
--
--  3. Surtout, elle recastait les valeurs existantes vers la nouvelle énumération SANS les
--     convertir. `critique` et `mineure` n'existent plus : le cast aurait échoué sur la
--     première ligne les portant — et s'il avait été forcé, la criticité de tout le parc
--     serait passée à NULL sans un mot.
--
-- La reprise de valeurs ci-dessous est le cœur de cette migration :
--     critique → essentielle        mineure → secondaire
-- Les deux autres (`vitale`, `importante`) sont inchangées et n'ont rien à faire.

CREATE TYPE "public"."couverture_detection" AS ENUM('soc_externe', 'wazuh', 'epp', 'aucune');--> statement-breakpoint
CREATE TYPE "public"."duree_indisponibilite_tolerable" AS ENUM('immediate', 'moins_4h', 'moins_24h', 'moins_72h', 'moins_1_semaine', 'plus_1_semaine');--> statement-breakpoint
CREATE TYPE "public"."criticite_surete" AS ENUM('vitale', 'critique', 'importante', 'mineure');--> statement-breakpoint

-- 1. La sûreté de fonctionnement quitte `app_criticite` pour son énumération propre.
--    Valeurs identiques : conversion directe, sans perte.
ALTER TABLE "machine_indus" ALTER COLUMN "criticite_surete" SET DATA TYPE "public"."criticite_surete" USING "criticite_surete"::text::"public"."criticite_surete";--> statement-breakpoint

-- 2. Les colonnes de criticité MÉTIER passent par le texte, le temps de reconstruire le type.
ALTER TABLE "processus_metier" ALTER COLUMN "criticite" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "criticite" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "appareil_mobile" ALTER COLUMN "criticite" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "iot" ALTER COLUMN "criticite" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "poste_travail" ALTER COLUMN "criticite" SET DATA TYPE text;--> statement-breakpoint

-- 3. REPRISE DES VALEURS, tant que les colonnes sont en texte.
UPDATE "processus_metier" SET "criticite" = 'essentielle' WHERE "criticite" = 'critique';--> statement-breakpoint
UPDATE "processus_metier" SET "criticite" = 'secondaire'  WHERE "criticite" = 'mineure';--> statement-breakpoint
UPDATE "application"      SET "criticite" = 'essentielle' WHERE "criticite" = 'critique';--> statement-breakpoint
UPDATE "application"      SET "criticite" = 'secondaire'  WHERE "criticite" = 'mineure';--> statement-breakpoint
UPDATE "appareil_mobile"  SET "criticite" = 'essentielle' WHERE "criticite" = 'critique';--> statement-breakpoint
UPDATE "appareil_mobile"  SET "criticite" = 'secondaire'  WHERE "criticite" = 'mineure';--> statement-breakpoint
UPDATE "iot"              SET "criticite" = 'essentielle' WHERE "criticite" = 'critique';--> statement-breakpoint
UPDATE "iot"              SET "criticite" = 'secondaire'  WHERE "criticite" = 'mineure';--> statement-breakpoint
UPDATE "poste_travail"    SET "criticite" = 'essentielle' WHERE "criticite" = 'critique';--> statement-breakpoint
UPDATE "poste_travail"    SET "criticite" = 'secondaire'  WHERE "criticite" = 'mineure';--> statement-breakpoint

-- 4. Reconstruction du type, plus aucune colonne ne le référence.
DROP TYPE "public"."app_criticite";--> statement-breakpoint
CREATE TYPE "public"."app_criticite" AS ENUM('vitale', 'essentielle', 'importante', 'secondaire');--> statement-breakpoint

-- 5. Retour au type. Toute valeur non convertie ferait échouer ce cast — c'est voulu :
--    mieux vaut une migration qui s'arrête qu'une criticité silencieusement vidée.
ALTER TABLE "processus_metier" ALTER COLUMN "criticite" SET DATA TYPE "public"."app_criticite" USING "criticite"::"public"."app_criticite";--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "criticite" SET DATA TYPE "public"."app_criticite" USING "criticite"::"public"."app_criticite";--> statement-breakpoint
ALTER TABLE "appareil_mobile" ALTER COLUMN "criticite" SET DATA TYPE "public"."app_criticite" USING "criticite"::"public"."app_criticite";--> statement-breakpoint
ALTER TABLE "iot" ALTER COLUMN "criticite" SET DATA TYPE "public"."app_criticite" USING "criticite"::"public"."app_criticite";--> statement-breakpoint
ALTER TABLE "poste_travail" ALTER COLUMN "criticite" SET DATA TYPE "public"."app_criticite" USING "criticite"::"public"."app_criticite";--> statement-breakpoint

-- 6. Nouvelles colonnes.
ALTER TABLE "application" ADD COLUMN "duree_indisponibilite_tolerable" "duree_indisponibilite_tolerable";--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "responsable_metier_id" text;--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "criticite" "app_criticite";--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "duree_indisponibilite_tolerable" "duree_indisponibilite_tolerable";--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "responsable_metier_id" text;--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "couverture_detection" "couverture_detection"[];--> statement-breakpoint
ALTER TABLE "poste_travail" ADD COLUMN "couverture_detection" "couverture_detection"[];--> statement-breakpoint
ALTER TABLE "tiers" ADD COLUMN "critique_nis2" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tiers" ADD COLUMN "dpa_signe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tiers" ADD COLUMN "clauses_securite" text;--> statement-breakpoint
ALTER TABLE "tiers" ADD COLUMN "date_revue" date;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_responsable_metier_id_personne_id_fk" FOREIGN KEY ("responsable_metier_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serveur" ADD CONSTRAINT "serveur_responsable_metier_id_personne_id_fk" FOREIGN KEY ("responsable_metier_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;
