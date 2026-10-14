CREATE TYPE "public"."app_categorie" AS ENUM('metier', 'bureautique', 'saas', 'technique_infra', 'securite', 'autre');--> statement-breakpoint
CREATE TYPE "public"."app_criticite" AS ENUM('vitale', 'critique', 'importante', 'mineure');--> statement-breakpoint
CREATE TYPE "public"."app_exposition" AS ENUM('interne', 'dmz', 'internet');--> statement-breakpoint
CREATE TYPE "public"."app_hebergement" AS ENUM('interne', 'cloud', 'saas', 'hybride');--> statement-breakpoint
CREATE TYPE "public"."app_maintenance" AS ENUM('a_jour', 'en_retard', 'non_maintenue', 'fin_de_support');--> statement-breakpoint
CREATE TYPE "public"."app_sensibilite" AS ENUM('publique', 'interne', 'restreinte', 'confidentielle');--> statement-breakpoint
CREATE TYPE "public"."app_statut" AS ENUM('en_projet', 'en_deploiement', 'en_production', 'en_maintenance', 'en_decommissionnement', 'retiree');--> statement-breakpoint
CREATE TYPE "public"."auth_methode" AS ENUM('oidc_oauth', 'ldap_ad', 'cas', 'comptes_locaux', 'autre');--> statement-breakpoint
CREATE TYPE "public"."responsabilite_role" AS ENUM('gestionnaire_technique', 'chef_de_projet', 'gestionnaire_quotidien', 'referent_metier');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'import');--> statement-breakpoint
CREATE TYPE "public"."deploiement_role" AS ENUM('frontal_web', 'applicatif', 'base_de_donnees', 'reverse_proxy', 'cache', 'batch', 'autre');--> statement-breakpoint
CREATE TYPE "public"."environnement" AS ENUM('production', 'preproduction', 'recette', 'developpement');--> statement-breakpoint
CREATE TYPE "public"."hyperviseur" AS ENUM('vmware', 'proxmox');--> statement-breakpoint
CREATE TYPE "public"."serveur_statut" AS ENUM('actif', 'arrete', 'decommissionne');--> statement-breakpoint
CREATE TYPE "public"."serveur_type" AS ENUM('vm', 'physique');--> statement-breakpoint
CREATE TYPE "public"."techno_categorie" AS ENUM('langage', 'framework', 'runtime', 'base_de_donnees', 'serveur_web', 'conteneurisation', 'orchestration', 'os', 'autre');--> statement-breakpoint
CREATE TYPE "public"."composante_type" AS ENUM('ufr', 'institut', 'ecole_ingenieur', 'ecole_interne', 'ecole_doctorale', 'service_commun', 'laboratoire', 'autre');--> statement-breakpoint
CREATE TYPE "public"."departement_type" AS ENUM('recherche', 'enseignement');--> statement-breakpoint
CREATE TYPE "public"."entite_statut_juridique" AS ENUM('epscp', 'epa', 'epic', 'gip', 'association', 'autre');--> statement-breakpoint
CREATE TYPE "public"."pole_domaine_it" AS ENUM('metiers', 'dev', 'systemes', 'reseaux', 'cyber', 'mesocentre', 'support', 'autre');--> statement-breakpoint
CREATE TYPE "public"."pole_type" AS ENUM('it', 'autre');--> statement-breakpoint
CREATE TYPE "public"."logiciel_categorie" AS ENUM('navigateur', 'bureautique', 'messagerie', 'securite', 'metier', 'utilitaire', 'multimedia', 'developpement', 'autre');--> statement-breakpoint
CREATE TYPE "public"."logiciel_installation" AS ENUM('libre_service', 'sur_demande', 'deploiement_centralise');--> statement-breakpoint
CREATE TYPE "public"."logiciel_licence" AS ENUM('gratuit', 'libre', 'payant', 'abonnement', 'autre');--> statement-breakpoint
CREATE TYPE "public"."logiciel_statut" AS ENUM('autorise', 'sur_derogation', 'retire');--> statement-breakpoint
CREATE TYPE "public"."category_role" AS ENUM('lecteur', 'contributeur', 'gestionnaire');--> statement-breakpoint
CREATE TYPE "public"."referent_role" AS ENUM('contractuel', 'technique', 'autre');--> statement-breakpoint
CREATE TYPE "public"."tiers_niveau_acces" AS ENUM('aucun', 'ponctuel', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."tiers_type" AS ENUM('prestataire_it', 'prestataire_non_it', 'editeur');--> statement-breakpoint
CREATE TYPE "public"."vpn_statut" AS ENUM('actif', 'suspendu', 'expire', 'revoque', 'en_attente');--> statement-breakpoint
CREATE TYPE "public"."change_request_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."change_request_statut" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_id" text,
	"events" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"url" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"secret" text,
	"events" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"categorie" "app_categorie" NOT NULL,
	"categorie_precision" text,
	"criticite" "app_criticite",
	"statut" "app_statut" DEFAULT 'en_production' NOT NULL,
	"hebergement" "app_hebergement",
	"exposition" "app_exposition",
	"sensibilite" "app_sensibilite",
	"donnees_personnelles" boolean DEFAULT false NOT NULL,
	"authentification" "auth_methode"[],
	"authentification_autre" text,
	"open_source" boolean,
	"dev_interne" boolean,
	"maintenue_a_jour" "app_maintenance",
	"url" text,
	"site_web" text,
	"depot_url" text,
	"editeur_id" text,
	"pole_id" text,
	"responsable_id" text,
	"date_mise_en_service" date,
	"date_fin_de_support" date,
	"homologuee" boolean DEFAULT false NOT NULL,
	"date_homologation" date,
	"date_revue_homologation" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_groupe" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"groupe_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_population" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"population_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intervention" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"tiers_id" text NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responsabilite" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"personne_id" text NOT NULL,
	"role" "responsabilite_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entite" text NOT NULL,
	"entite_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"user_id" text,
	"diff" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_account" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_key" (
	"id" text PRIMARY KEY NOT NULL,
	"service_account_id" text NOT NULL,
	"key" text NOT NULL,
	"metadata" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_technologie" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"technologie_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploiement" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"serveur_id" text NOT NULL,
	"role" "deploiement_role" NOT NULL,
	"role_precision" text,
	"environnement" "environnement",
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serveur" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"type" "serveur_type" NOT NULL,
	"hyperviseur" "hyperviseur",
	"cluster_virt" text,
	"localisation" text,
	"os" text,
	"os_version" text,
	"cpu" integer,
	"ram_go" integer,
	"disque_go" integer,
	"ip" text,
	"vlan" text,
	"environnement" "environnement",
	"haute_dispo" boolean DEFAULT false NOT NULL,
	"cluster_nom" text,
	"statut" "serveur_statut" DEFAULT 'actif' NOT NULL,
	"date_dernier_patch" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "serveur_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
CREATE TABLE "serveur_technologie" (
	"id" text PRIMARY KEY NOT NULL,
	"serveur_id" text NOT NULL,
	"technologie_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technologie" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"version" text,
	"categorie" "techno_categorie",
	"categorie_precision" text,
	"fin_de_vie" date,
	"lien_doc" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composante" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"sigle" text,
	"description" text,
	"entite_id" text NOT NULL,
	"type" "composante_type" NOT NULL,
	"centrale" boolean DEFAULT false NOT NULL,
	"effectif" integer,
	"site_web" text,
	"directeur_id" text,
	"rsa_id" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departement" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"composante_id" text NOT NULL,
	"type" "departement_type" NOT NULL,
	"effectif" integer,
	"site_web" text,
	"directeur_id" text,
	"secretaire_id" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entite" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"sigle" text,
	"description" text,
	"statut_juridique" "entite_statut_juridique",
	"effectif" integer,
	"site_web" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personne" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"prenom" text,
	"description" text,
	"email" text,
	"telephone" text,
	"fonction" text,
	"service_id" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pole" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"service_id" text NOT NULL,
	"type" "pole_type" NOT NULL,
	"domaine_it" "pole_domaine_it",
	"domaine" text,
	"raison_etre" text,
	"effectif" integer,
	"responsable_id" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"composante_id" text NOT NULL,
	"central" boolean DEFAULT false NOT NULL,
	"raison_etre" text,
	"effectif" integer,
	"site_web" text,
	"directeur_id" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logiciel_poste" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"editeur" text,
	"version" text,
	"categorie" "logiciel_categorie" NOT NULL,
	"categorie_precision" text,
	"description" text,
	"type_licence" "logiciel_licence",
	"type_licence_precision" text,
	"installation" "logiciel_installation",
	"statut" "logiciel_statut" DEFAULT 'autorise' NOT NULL,
	"url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logiciel_poste_population" (
	"id" text PRIMARY KEY NOT NULL,
	"logiciel_poste_id" text NOT NULL,
	"population_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groupe" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"ref_groupe_ad" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "population" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "population_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "user_category_role" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"role" "category_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" text PRIMARY KEY NOT NULL,
	"tiers_id" text NOT NULL,
	"nom" text NOT NULL,
	"email" text,
	"telephone" text,
	"fonction" text,
	"principal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" "tiers_type" NOT NULL,
	"activite" text,
	"contrat_ref" text,
	"contrat_fin" date,
	"niveau_acces" "tiers_niveau_acces",
	"notes_securite" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiers_referent" (
	"id" text PRIMARY KEY NOT NULL,
	"tiers_id" text NOT NULL,
	"personne_id" text NOT NULL,
	"role" "referent_role",
	"principal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acces_vpn" (
	"id" text PRIMARY KEY NOT NULL,
	"tiers_id" text NOT NULL,
	"identifiant" text,
	"perimetre" text,
	"mfa" boolean DEFAULT false NOT NULL,
	"statut" "vpn_statut" DEFAULT 'actif' NOT NULL,
	"date_ouverture" date,
	"date_expiration" date,
	"date_derniere_revue" date,
	"motif" text,
	"valide_par_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acces_vpn_application" (
	"id" text PRIMARY KEY NOT NULL,
	"acces_vpn_id" text NOT NULL,
	"application_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_request" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"action" "change_request_action" NOT NULL,
	"entity_id" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"payload" jsonb,
	"requested_by" text,
	"status" "change_request_statut" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_editeur_id_tiers_id_fk" FOREIGN KEY ("editeur_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_pole_id_pole_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."pole"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_groupe" ADD CONSTRAINT "application_groupe_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_groupe" ADD CONSTRAINT "application_groupe_groupe_id_groupe_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "public"."groupe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_population" ADD CONSTRAINT "application_population_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_population" ADD CONSTRAINT "application_population_population_id_population_id_fk" FOREIGN KEY ("population_id") REFERENCES "public"."population"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_tiers_id_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsabilite" ADD CONSTRAINT "responsabilite_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsabilite" ADD CONSTRAINT "responsabilite_personne_id_personne_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personne"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_key" ADD CONSTRAINT "service_key_service_account_id_service_account_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_technologie" ADD CONSTRAINT "application_technologie_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_technologie" ADD CONSTRAINT "application_technologie_technologie_id_technologie_id_fk" FOREIGN KEY ("technologie_id") REFERENCES "public"."technologie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploiement" ADD CONSTRAINT "deploiement_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploiement" ADD CONSTRAINT "deploiement_serveur_id_serveur_id_fk" FOREIGN KEY ("serveur_id") REFERENCES "public"."serveur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serveur_technologie" ADD CONSTRAINT "serveur_technologie_serveur_id_serveur_id_fk" FOREIGN KEY ("serveur_id") REFERENCES "public"."serveur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serveur_technologie" ADD CONSTRAINT "serveur_technologie_technologie_id_technologie_id_fk" FOREIGN KEY ("technologie_id") REFERENCES "public"."technologie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composante" ADD CONSTRAINT "composante_entite_id_entite_id_fk" FOREIGN KEY ("entite_id") REFERENCES "public"."entite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composante" ADD CONSTRAINT "composante_directeur_id_personne_id_fk" FOREIGN KEY ("directeur_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composante" ADD CONSTRAINT "composante_rsa_id_personne_id_fk" FOREIGN KEY ("rsa_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departement" ADD CONSTRAINT "departement_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departement" ADD CONSTRAINT "departement_directeur_id_personne_id_fk" FOREIGN KEY ("directeur_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departement" ADD CONSTRAINT "departement_secretaire_id_personne_id_fk" FOREIGN KEY ("secretaire_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personne" ADD CONSTRAINT "personne_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pole" ADD CONSTRAINT "pole_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pole" ADD CONSTRAINT "pole_responsable_id_personne_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_composante_id_composante_id_fk" FOREIGN KEY ("composante_id") REFERENCES "public"."composante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_directeur_id_personne_id_fk" FOREIGN KEY ("directeur_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logiciel_poste_population" ADD CONSTRAINT "logiciel_poste_population_logiciel_poste_id_logiciel_poste_id_fk" FOREIGN KEY ("logiciel_poste_id") REFERENCES "public"."logiciel_poste"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logiciel_poste_population" ADD CONSTRAINT "logiciel_poste_population_population_id_population_id_fk" FOREIGN KEY ("population_id") REFERENCES "public"."population"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_category_role" ADD CONSTRAINT "user_category_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_tiers_id_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiers_referent" ADD CONSTRAINT "tiers_referent_tiers_id_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiers_referent" ADD CONSTRAINT "tiers_referent_personne_id_personne_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personne"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acces_vpn" ADD CONSTRAINT "acces_vpn_tiers_id_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acces_vpn" ADD CONSTRAINT "acces_vpn_valide_par_id_personne_id_fk" FOREIGN KEY ("valide_par_id") REFERENCES "public"."personne"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acces_vpn_application" ADD CONSTRAINT "acces_vpn_application_acces_vpn_id_acces_vpn_id_fk" FOREIGN KEY ("acces_vpn_id") REFERENCES "public"."acces_vpn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acces_vpn_application" ADD CONSTRAINT "acces_vpn_application_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_unique" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "application_groupe_unique" ON "application_groupe" USING btree ("application_id","groupe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_population_unique" ON "application_population" USING btree ("application_id","population_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intervention_unique" ON "intervention" USING btree ("application_id","tiers_id");--> statement-breakpoint
CREATE UNIQUE INDEX "responsabilite_unique" ON "responsabilite" USING btree ("application_id","personne_id","role");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "service_key_key_idx" ON "service_key" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "application_technologie_unique" ON "application_technologie" USING btree ("application_id","technologie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deploiement_unique" ON "deploiement" USING btree ("application_id","serveur_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "serveur_technologie_unique" ON "serveur_technologie" USING btree ("serveur_id","technologie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "technologie_nom_version_unique" ON "technologie" USING btree ("nom","version");--> statement-breakpoint
CREATE UNIQUE INDEX "logiciel_poste_population_unique" ON "logiciel_poste_population" USING btree ("logiciel_poste_id","population_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_category_role_unique" ON "user_category_role" USING btree ("user_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "tiers_referent_unique" ON "tiers_referent" USING btree ("tiers_id","personne_id");--> statement-breakpoint
CREATE UNIQUE INDEX "acces_vpn_application_unique" ON "acces_vpn_application" USING btree ("acces_vpn_id","application_id");