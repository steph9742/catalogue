-- SERVICES EXPOSÉS — « Sites et services ».
--
-- Le certificat était l'objet du catalogue, ce qui est à l'envers : un certificat est une
-- PROPRIÉTÉ d'un service exposé, au même titre que ses technologies.
--
-- Le rattachement des certificats existants se fait sur (hote, port), déjà leur clé
-- fonctionnelle : aucune troisième liste d'hôtes à entretenir.

CREATE TYPE "service_type" AS ENUM('web', 'messagerie', 'annuaire', 'autre');--> statement-breakpoint
CREATE TYPE "detection_certitude" AS ENUM('certain', 'probable', 'absente');--> statement-breakpoint
CREATE TYPE "detection_source" AS ENUM('entete_server', 'entete_powered_by', 'meta_generator', 'chemin_actif', 'manuel');--> statement-breakpoint

CREATE TABLE "service_expose" (
  "id" text PRIMARY KEY NOT NULL,
  "hote" text NOT NULL,
  "port" integer DEFAULT 443 NOT NULL,
  "libelle" text,
  "type" "service_type" DEFAULT 'web' NOT NULL,
  "application_id" text,
  "proprietaire_id" text,
  "surveille" boolean DEFAULT true NOT NULL,
  "notes" text,
  -- NULL = jamais scanné, et non « scan sans résultat ». Les pastilles valent alors
  -- « inconnu » : aucune conclusion n'est possible sur ce service.
  "dernier_scan_at" timestamp,
  "dernier_statut" text,
  "dernier_message" text,
  "code_http" integer,
  -- En-têtes de sécurité : NULL = jamais relevé, false = relevé et absent. Confondre les
  -- deux ferait lire un service non scanné comme conforme.
  "hsts" boolean,
  "csp" boolean,
  "x_frame_options" boolean,
  "referrer_policy" boolean,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "service_technologie" (
  "id" text PRIMARY KEY NOT NULL,
  "service_id" text NOT NULL,
  "produit" text NOT NULL,
  "version" text,
  -- Nulle tant que la version est inconnue : rapprocher « WordPress » sans version
  -- donnerait la date d'une release précise à tout un produit.
  "technologie_cle" text,
  "technologie_id" text,
  "certitude" "detection_certitude" NOT NULL,
  "source" "detection_source" NOT NULL,
  "detecte_le" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);--> statement-breakpoint

ALTER TABLE "service_expose" ADD CONSTRAINT "service_expose_application_id_fk"
  FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "service_expose" ADD CONSTRAINT "service_expose_proprietaire_id_fk"
  FOREIGN KEY ("proprietaire_id") REFERENCES "personne"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "service_technologie" ADD CONSTRAINT "service_technologie_service_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "service_expose"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "service_technologie" ADD CONSTRAINT "service_technologie_technologie_id_fk"
  FOREIGN KEY ("technologie_id") REFERENCES "technologie"("id") ON DELETE set null;--> statement-breakpoint

CREATE UNIQUE INDEX "service_expose_hote_port_unique" ON "service_expose" ("hote", "port");--> statement-breakpoint
CREATE INDEX "service_expose_application_idx" ON "service_expose" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_technologie_unique" ON "service_technologie" ("service_id", "produit");--> statement-breakpoint
CREATE INDEX "service_technologie_cle_idx" ON "service_technologie" ("technologie_cle");--> statement-breakpoint

-- Le certificat pointe vers son service. NULLABLE et le restera : un certificat importé
-- avant que son service ne soit déclaré doit rester lisible.
ALTER TABLE "certificat" ADD COLUMN "service_id" text;--> statement-breakpoint
CREATE INDEX "certificat_service_idx" ON "certificat" ("service_id");--> statement-breakpoint

-- REPRISE : un service par certificat surveillé, rattaché sur sa clé fonctionnelle.
--
-- Le type est déduit du PORT, ce qui est une présomption raisonnable et corrigeable à la
-- main : 443 et 80 sont du web, 636 et 389 un annuaire, 465/587/993/995 de la messagerie.
-- Tout le reste part en « autre » plutôt qu'en « web », faute de quoi un service sans
-- technologie détectée se lirait comme une détection en échec.
INSERT INTO "service_expose" ("id", "hote", "port", "libelle", "type", "surveille", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  c."hote",
  c."port",
  MIN(c."libelle"),
  CASE
    WHEN c."port" IN (443, 80, 8443, 8080) THEN 'web'
    WHEN c."port" IN (636, 389, 3269, 3268) THEN 'annuaire'
    WHEN c."port" IN (465, 587, 993, 995, 25, 143, 110) THEN 'messagerie'
    ELSE 'autre'
  END::"service_type",
  bool_or(c."surveille"),
  now(), now()
FROM "certificat" c
GROUP BY c."hote", c."port"
ON CONFLICT ("hote", "port") DO NOTHING;--> statement-breakpoint

UPDATE "certificat" c
SET "service_id" = s."id"
FROM "service_expose" s
WHERE s."hote" = c."hote" AND s."port" = c."port";--> statement-breakpoint

ALTER TABLE "certificat" ADD CONSTRAINT "certificat_service_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "service_expose"("id") ON DELETE set null;--> statement-breakpoint

-- Versions de référence sur le référentiel de technologies. endoflife.date les rend déjà ;
-- le connecteur les recevait et les jetait.
ALTER TABLE "technologie" ADD COLUMN "derniere_version_branche" text;--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN "derniere_version_generale" text;--> statement-breakpoint
-- NULL = non déterminé, jamais « oui ».
ALTER TABLE "technologie" ADD COLUMN "branche_maintenue" boolean;--> statement-breakpoint
ALTER TABLE "technologie" ADD COLUMN "derniere_version_relevee_le" timestamp;
