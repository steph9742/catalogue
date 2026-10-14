-- Groupes GLPI sur la table de transit de l'inventaire.
--
-- `groupe` = groupe propriétaire (groups_id, option de recherche 71).
-- `groupe_technique` = groupe en charge (groups_id_tech, option 49).
--
-- Colonnes nullables sans défaut : les machines déjà synchronisées restent valides et
-- se rempliront au prochain passage du connecteur. Aucune reprise de données à faire.
ALTER TABLE "glpi_machine" ADD COLUMN IF NOT EXISTS "groupe" text;--> statement-breakpoint
ALTER TABLE "glpi_machine" ADD COLUMN IF NOT EXISTS "groupe_technique" text;
