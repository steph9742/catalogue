-- Clé de rapprochement avec le référentiel de fin de vie, matérialisée.
--
-- NULLABLE ET SANS VALEUR PAR DÉFAUT, délibérément. Une valeur par défaut ferait lire tout
-- le parc comme rapproché dès l'application de cette migration, et un statut « supporté »
-- par défaut ferait lire tout le parc comme sain le premier jour. `null` signifie « pas
-- encore évalué » et les compteurs le nomment, au lieu de le fondre dans les machines
-- saines.
--
-- La colonne est remplie par `reconcilierClesTechnologie()`, qui compare la clé stockée à
-- la clé recalculée pour TOUTES les lignes — et non seulement pour celles que la dernière
-- synchronisation a touchées. Une reprise qui suivrait la détection de changement du
-- connecteur laisserait à null toutes les machines dont la fiche GLPI n'a pas bougé, sans
-- que rien ne le signale.
ALTER TABLE "serveur" ADD COLUMN "technologie_cle" text;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD COLUMN "technologie_cle" text;--> statement-breakpoint
CREATE INDEX "serveur_technologie_cle_idx" ON "serveur" ("technologie_cle");--> statement-breakpoint
CREATE INDEX "poste_travail_technologie_cle_idx" ON "poste_travail" ("technologie_cle");
