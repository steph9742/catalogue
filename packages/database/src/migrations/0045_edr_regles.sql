-- Contenu des moteurs de détection de l'EDR : jeux de règles et règles.
--
-- Ni date de validité ni révision, contrairement aux listes blanches de 0044, et c'est
-- délibéré : une règle de détection n'est pas un angle mort qu'on ouvre pour un temps,
-- elle EST la couverture. Lui coller une échéance reviendrait à traiter la protection
-- comme une dérogation.
--
-- Les cinq moteurs tiennent dans UNE table : ce qui diffère est le contenu (fichier
-- YARA, YAML Sigma, couple type/valeur), pas la structure. Cinq tables jumelles
-- auraient divergé — ce dépôt en a déjà fait les frais avec les tables de teintes.
--
-- `brut` conserve l'enregistrement complet de l'API : les schémas varient d'un moteur et
-- d'une version à l'autre, et sans cette copie un champ non prévu disparaîtrait sans
-- que personne ne s'en aperçoive.
CREATE TYPE "public"."edr_moteur" AS ENUM('yara', 'sigma', 'ioc', 'correlation', 'driverblock');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edr_regle" (
	"id" text PRIMARY KEY NOT NULL,
	"moteur" "edr_moteur" NOT NULL,
	"harfanglab_id" text NOT NULL,
	"nom" text,
	"description" text,
	"contenu" text,
	"type_indicateur" text,
	"valeur" text,
	"actif" boolean,
	"etat" text,
	"etat_effectif" text,
	"source_id" text,
	"source_nom" text,
	"fourni_par_editeur" boolean,
	"rulesets" jsonb,
	"brut" jsonb,
	"date_creation" timestamp,
	"date_maj" timestamp,
	"vu_au_sync" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edr_ruleset" (
	"id" text PRIMARY KEY NOT NULL,
	"ruleset_id" text NOT NULL,
	"moteur" "edr_moteur" NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"actif" boolean,
	"detection_poste" boolean,
	"blocage_agent" boolean,
	"quarantaine_agent" boolean,
	"compteurs" jsonb,
	"politiques" jsonb,
	"date_creation" timestamp,
	"date_maj" timestamp,
	"vu_au_sync" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "edr_ruleset_ruleset_id_unique" UNIQUE("ruleset_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edr_regle_moteur_id_idx" ON "edr_regle" USING btree ("moteur","harfanglab_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edr_regle_moteur_idx" ON "edr_regle" USING btree ("moteur");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edr_ruleset_moteur_idx" ON "edr_ruleset" USING btree ("moteur");
