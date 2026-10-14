-- Listes blanches : l'origine remplace le tag, et l'autorité sur l'échéance est écrite.
--
-- MESURÉ le 27/08/2026 sur l'instance : `WhitelistRule` n'expose AUCUN champ d'étiquettes
-- (`tags`, `labels`, `categories`, `category` tous absents) sur les 4797 règles. Le tag
-- « technique » ne pouvait donc classer personne. Le mécanisme reste en place — il ne
-- coûte rien et servira si l'éditeur ajoute un champ — mais le tri réel se fait ailleurs.
--
-- `fourni_par_editeur` (`provided_by_hlab`) fait ce travail, et mieux : structuré,
-- documenté par l'éditeur, sans convention d'écriture à maintenir. Une règle livrée avec
-- le produit ne procède d'aucune décision de la cellule — lui donner une échéance
-- reviendrait à demander de justifier périodiquement le produit qu'on achète. Sur 4797
-- règles, cela ramène la population à échéance à quelques dizaines : celles que la cellule
-- a réellement écrites.
--
-- `presente` : une règle retirée de l'EDR n'est plus un angle mort, donc plus d'échéance.
-- Mais si une exclusion active la référence encore, une détection est revenue sans que
-- personne l'ait décidé — c'est un écart, que Sniff compte déjà de son côté.
--
-- `echeance_sniff` : quand la règle est appariée à une exclusion, la date naît là où naît
-- la décision. Elle prime alors sur tout calcul local, y compris sur une prolongation
-- décidée ici AVANT l'appariement — l'appariement manuel rend ce cas concret.
--
-- `date_creation` devient NULLABLE : l'EDR ne rend pas toujours `creation_date`. Retomber
-- en silence sur la date d'import donnerait une échéance à la fois fausse et rassurante,
-- ce que cette colonne sert précisément à éviter. Sans date, pas d'échéance, et on le dit.
ALTER TABLE "whitelist" ALTER COLUMN "date_creation" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "fourni_par_editeur" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "presente" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "echeance_sniff" timestamp;