-- « Critique » sans niveau précisé, dans l'échelle de criticité métier.
--
-- L'échelle avait été scindée (« critique » → `essentielle`, « mineure » → `secondaire`)
-- pour distinguer ce qui l'était vraiment. Mais une source qui dit seulement « critique »
-- — un groupe GLPI, par exemple — ne permet PAS de trancher entre vitale et essentielle.
-- Forcer le choix reviendrait à inventer une précision qu'on n'a pas.
--
-- La valeur est donc rétablie, placée juste sous `vitale` : elle enregistre ce que la
-- source affirme, sans plus. La cellule affinera quand elle le décidera.
ALTER TYPE "app_criticite" ADD VALUE IF NOT EXISTS 'critique' AFTER 'vitale';
