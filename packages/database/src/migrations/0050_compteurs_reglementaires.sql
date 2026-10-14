-- Compteurs réglementaires : le Catalogue devient un MIROIR de Sniff.
--
-- Les deux applications tenaient chacune une grille d'applicabilité pour l'article 23.
-- Elles concordaient partout sauf sur P2 — celui que Sniff laisse délibérément « à
-- évaluer », et que le Catalogue tranchait « applicable » tout seul, par une règle sur la
-- gravité, sans trace ni auteur.
--
-- La pire conséquence n'est pas celle qu'on croit : sur un incident que le RSSI aurait
-- écarté, l'outil de CONFORMITÉ documentait lui-même un manquement qui n'en était
-- peut-être pas un. Dans un dossier opposable, c'est le mauvais sens de l'erreur.
--
-- Désormais : l'applicabilité et les dépôts se décident et se saisissent dans Sniff,
-- pendant la conduite de l'incident, par la personne qui le conduit. Le Catalogue lit
-- `defaut` et `applicable` au lieu de recalculer — la divergence disparaît alors par
-- CONSTRUCTION, quelle que soit la grille en vigueur chez eux.
--
-- `court` est le champ qui dit si un compteur doit être surveillé maintenant : applicable
-- ET rien de déposé. Repris tel quel, jamais recalculé. Un jalon déposé dont l'échéance
-- est dépassée n'est pas en retard — c'est un devoir accompli.
--
-- `condition` est un TEXTE qui change selon les réglages de Sniff (la date d'entrée en
-- vigueur de NIS 2 n'étant pas connue, la bascule P2 y est un réglage et non une constante).
-- À afficher tel quel, jamais à analyser.
--
-- Ce miroir ne s'efface jamais sur une panne : un miroir qui se vide sur une coupure réseau
-- ferait taire des échéances réglementaires réelles.
--
-- `notification_incident_nis2` est CONSERVÉE et n'est plus écrite : elle garde les dépôts
-- enregistrés avant cette bascule, que Sniff ignore pour les incidents antérieurs. Les
-- écraser effacerait la preuve qu'une déclaration a été faite.
CREATE TABLE IF NOT EXISTS "sniff_echeance" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"cle" text NOT NULL,
	"nom" text,
	"delai_heures" integer,
	"depart" text,
	"condition" text,
	"porteur" text,
	"defaut" text,
	"applicable" boolean,
	"decide_par" text,
	"decide_le" timestamp,
	"court" boolean DEFAULT false NOT NULL,
	"echeance" timestamp,
	"depose_le" timestamp,
	"reference" text,
	"depose_par" text,
	"vu_au_sync" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sniff_incident" (
	"incident_id" text PRIMARY KEY NOT NULL,
	"type" text,
	"severity" text,
	"niveau" text,
	"statut" text,
	"knowledge_at" timestamp,
	"knowledge_estimated" boolean,
	"vu_au_sync" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sniff_echeance_unique" ON "sniff_echeance" USING btree ("incident_id","cle");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sniff_echeance_court_idx" ON "sniff_echeance" USING btree ("court","echeance");