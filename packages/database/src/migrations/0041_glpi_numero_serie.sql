-- Numéro de série des machines GLPI.
--
-- Deux entrées d'inventaire qui partagent un numéro de série sont la même machine
-- physique : c'est ce qui permet de distinguer un doublon à purger d'une machine
-- réellement distincte, là où le nom seul ne tranche pas.
--
-- Nullable sans défaut : toutes les machines n'en portent pas (machines virtuelles,
-- matériel ancien), et l'absence doit rester lisible comme telle.
ALTER TABLE "glpi_machine" ADD COLUMN IF NOT EXISTS "numero_serie" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "glpi_machine_numero_serie_idx" ON "glpi_machine" ("numero_serie");
