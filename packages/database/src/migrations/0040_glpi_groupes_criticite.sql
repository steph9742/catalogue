-- Correspondance « groupe GLPI → criticité », déclarée dans les réglages du connecteur.
--
-- Forme : [{ "groupe": "Machines critiques", "criticite": "vitale" }, …]
--
-- Nullable sans défaut : tant que la cellule n'a rien déclaré, la synchronisation
-- n'applique aucune criticité — l'absence de règle ne doit jamais valoir règle implicite.
ALTER TABLE "connecteur_glpi" ADD COLUMN IF NOT EXISTS "groupes_criticite" jsonb;
