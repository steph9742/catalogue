-- Listes blanches TECHNIQUES : inventoriées, mais sans échéance de revue.
--
-- Une exclusion est une DÉROGATION : quelqu'un a décidé de ne plus voir quelque chose, et
-- cette décision se réexamine. Une règle d'exploitation de l'EDR — déploiement, scripts,
-- exceptions d'outillage — n'en est pas une : elle fait partie de la configuration.
--
-- Les dater toutes produirait des dizaines de lignes perpétuellement échues, impossibles à
-- solder, qui NOIERAIENT les quelques exclusions réellement en retard. Un compteur qui ne
-- peut pas descendre est un compteur qu'on cesse de lire.
--
-- Ne pas les dater n'est pas les cacher : elles restent dans l'inventaire, filtrables, et
-- ce qui pèse sur elles est l'absence de motif écrit — un manque qui se comble une fois.
--
-- ⚠️ Le critère est le TAG, PAS l'absence d'incident. Une règle sans tag et sans incident
-- a besoin d'une échéance : c'est précisément une exclusion que personne n'a rattachée.
--
-- `champ_tags` dit dans QUEL champ de l'API le marqueur a été trouvé. Le swagger
-- HarfangLab ne documente aucun champ de tag sur `WhitelistRule` : cette colonne rapporte
-- où il vit réellement, constaté à la synchronisation, au lieu de le laisser supposé.
-- `marqueurs_techniques` porte la liste déclarée par la cellule, corrigeable sans code.
ALTER TABLE "connecteur_harfanglab" ADD COLUMN "marqueurs_techniques" jsonb;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "technique" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "champ_tags" text;