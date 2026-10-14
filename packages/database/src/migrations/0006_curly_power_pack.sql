CREATE TYPE "public"."actif_donnee_categorie" AS ENUM('donnees_personnelles', 'rh', 'scolarite', 'recherche', 'financieres', 'techniques', 'autre');--> statement-breakpoint
CREATE TYPE "public"."processus_domaine" AS ENUM('rh', 'finances', 'scolarite', 'recherche', 'si', 'pilotage', 'autre');--> statement-breakpoint
CREATE TYPE "public"."sensibilite_donnee" AS ENUM('publique', 'interne', 'restreinte', 'confidentielle');--> statement-breakpoint
CREATE TYPE "public"."lieu_type" AS ENUM('site', 'batiment', 'salle', 'baie');--> statement-breakpoint
CREATE TYPE "public"."iot_categorie" AS ENUM('camera', 'capteur', 'imprimante', 'affichage', 'controle_acces', 'reseau', 'autre');--> statement-breakpoint
CREATE TYPE "public"."iot_exposition" AS ENUM('isole', 'interne', 'expose');--> statement-breakpoint
CREATE TYPE "public"."machine_indus_fonction" AS ENUM('automate', 'ihm', 'capteur', 'robot', 'variateur', 'autre');--> statement-breakpoint
CREATE TYPE "public"."materiel_statut" AS ENUM('actif', 'en_stock', 'en_panne', 'reforme');--> statement-breakpoint
CREATE TYPE "public"."ot_protocole" AS ENUM('modbus', 'profinet', 'opc_ua', 'ethernet_ip', 'bacnet', 'autre');--> statement-breakpoint
CREATE TYPE "public"."poste_travail_type" AS ENUM('fixe', 'portable', 'tout_en_un', 'client_leger', 'autre');--> statement-breakpoint
CREATE TYPE "public"."equipement_reseau_type" AS ENUM('switch', 'routeur', 'firewall', 'borne_wifi', 'load_balancer', 'passerelle', 'autre');--> statement-breakpoint
CREATE TYPE "public"."flux_protocole" AS ENUM('tcp', 'udp', 'icmp', 'tout', 'autre');--> statement-breakpoint
CREATE TYPE "public"."flux_statut" AS ENUM('autorise', 'a_revoir', 'interdit');--> statement-breakpoint
CREATE TYPE "public"."zone_niveau" AS ENUM('non_maitrise', 'exposee', 'interne', 'securisee', 'critique');--> statement-breakpoint
CREATE TYPE "public"."zone_reseau_type" AS ENUM('zone_securite', 'vlan', 'sous_reseau', 'dmz');--> statement-breakpoint
CREATE TABLE "actif_informationnel" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"categorie" "actif_donnee_categorie",
	"description" text,
	"sensibilite" "sensibilite_donnee",
	"donnees_personnelles" boolean DEFAULT false NOT NULL,
	"support" text,
	"proprietaire_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "actif_informationnel_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "processus_metier" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"domaine" "processus_domaine",
	"description" text,
	"criticite" "app_criticite",
	"proprietaire_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "processus_metier_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "lieu" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "lieu_type" NOT NULL,
	"parent_id" text,
	"code" text,
	"adresse" text,
	"nb_u" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iot" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"categorie" "iot_categorie",
	"marque" text,
	"modele" text,
	"numero_serie" text,
	"firmware_version" text,
	"ip" text,
	"adresse_mac" text,
	"vlan" text,
	"localisation" text,
	"lieu_id" text,
	"exposition" "iot_exposition",
	"criticite" "app_criticite",
	"statut" "materiel_statut" DEFAULT 'actif' NOT NULL,
	"responsable_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "iot_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "machine_indus" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"fonction" "machine_indus_fonction",
	"marque" text,
	"modele" text,
	"numero_serie" text,
	"protocole" "ot_protocole",
	"firmware_version" text,
	"ip" text,
	"vlan" text,
	"localisation" text,
	"lieu_id" text,
	"criticite_surete" "app_criticite",
	"statut" "materiel_statut" DEFAULT 'actif' NOT NULL,
	"responsable_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "machine_indus_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "poste_travail" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "poste_travail_type",
	"marque" text,
	"modele" text,
	"numero_serie" text,
	"os" text,
	"os_version" text,
	"ip" text,
	"adresse_mac" text,
	"localisation" text,
	"lieu_id" text,
	"utilisateur_principal_id" text,
	"criticite" "app_criticite",
	"statut" "materiel_statut" DEFAULT 'actif' NOT NULL,
	"date_achat" date,
	"garantie_fin" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "poste_travail_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "equipement_reseau" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "equipement_reseau_type",
	"marque" text,
	"modele" text,
	"numero_serie" text,
	"os_firmware" text,
	"ip_gestion" text,
	"localisation" text,
	"lieu_id" text,
	"statut" "materiel_statut" DEFAULT 'actif' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipement_reseau_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "flux_reseau" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"source_zone_id" text,
	"destination_zone_id" text,
	"protocole" "flux_protocole",
	"port" text,
	"statut" "flux_statut" DEFAULT 'a_revoir' NOT NULL,
	"justification" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_reseau" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "zone_reseau_type",
	"vlan_id" integer,
	"cidr" text,
	"niveau" "zone_niveau",
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "zone_reseau_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
ALTER TABLE "serveur" ADD COLUMN "lieu_id" text;--> statement-breakpoint
ALTER TABLE "actif_informationnel" ADD CONSTRAINT "actif_informationnel_proprietaire_id_personne_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processus_metier" ADD CONSTRAINT "processus_metier_proprietaire_id_personne_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lieu" ADD CONSTRAINT "lieu_parent_id_lieu_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lieu"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot" ADD CONSTRAINT "iot_lieu_id_lieu_id_fk" FOREIGN KEY ("lieu_id") REFERENCES "public"."lieu"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot" ADD CONSTRAINT "iot_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD CONSTRAINT "machine_indus_lieu_id_lieu_id_fk" FOREIGN KEY ("lieu_id") REFERENCES "public"."lieu"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_indus" ADD CONSTRAINT "machine_indus_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD CONSTRAINT "poste_travail_lieu_id_lieu_id_fk" FOREIGN KEY ("lieu_id") REFERENCES "public"."lieu"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poste_travail" ADD CONSTRAINT "poste_travail_utilisateur_principal_id_personne_id_fk" FOREIGN KEY ("utilisateur_principal_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipement_reseau" ADD CONSTRAINT "equipement_reseau_lieu_id_lieu_id_fk" FOREIGN KEY ("lieu_id") REFERENCES "public"."lieu"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flux_reseau" ADD CONSTRAINT "flux_reseau_source_zone_id_zone_reseau_id_fk" FOREIGN KEY ("source_zone_id") REFERENCES "public"."zone_reseau"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flux_reseau" ADD CONSTRAINT "flux_reseau_destination_zone_id_zone_reseau_id_fk" FOREIGN KEY ("destination_zone_id") REFERENCES "public"."zone_reseau"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serveur" ADD CONSTRAINT "serveur_lieu_id_lieu_id_fk" FOREIGN KEY ("lieu_id") REFERENCES "public"."lieu"("id") ON DELETE set null ON UPDATE no action;