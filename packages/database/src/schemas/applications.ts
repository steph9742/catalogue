import { pgTable, pgEnum, text, boolean, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { pole, personne } from './organisation'
import { tiers } from './tiers'
import { population, groupe } from './profils'

// Type d'unité organisationnelle responsable d'une application (en plus du responsable
// humain, toujours présent). Référence polymorphe : type + id (pas de FK stricte).
export const appResponsableOrgaType = pgEnum('app_responsable_orga_type', [
  'pole',
  'composante',
  'service',
  'departement',
])

export const appCategorie = pgEnum('app_categorie', [
  'metier',
  'bureautique',
  'saas',
  'technique_infra',
  'securite',
  'autre',
])
// CRITICITÉ MÉTIER — alignée sur le vocabulaire de la directive NIS 2. L'échelle portait
// auparavant `vitale · critique · importante · mineure`.
export const appCriticite = pgEnum('app_criticite', [
  'vitale',
  // « Critique » sans niveau précisé : ce qu'affirme une source qui ne différencie pas (un
  // groupe GLPI, par exemple).
  'critique',
  'essentielle',
  'importante',
  'secondaire',
])

// Durée maximale d'interruption admissible (DMIA / RTO). Échelle plutôt que saisie libre : « 4
// h » et « une demi-journée » désignent la même chose et ne se comparent pas, alors que
// l'annexe E et les plans de continuité exigent de trier et de regrouper.
export const dureeIndisponibiliteTolerable = pgEnum('duree_indisponibilite_tolerable', [
  'immediate', // aucune interruption admissible
  'moins_4h',
  'moins_24h',
  'moins_72h',
  'moins_1_semaine',
  'plus_1_semaine',
])
export const appStatut = pgEnum('app_statut', [
  'en_projet',
  'en_deploiement',
  'en_production',
  'en_maintenance',
  'en_decommissionnement',
  'retiree',
])
export const appHebergement = pgEnum('app_hebergement', [
  'interne',
  'cloud',
  'saas',
  'hybride',
])
export const appExposition = pgEnum('app_exposition', ['interne', 'dmz', 'internet'])
export const appSensibilite = pgEnum('app_sensibilite', [
  'publique',
  'interne',
  'restreinte',
  'confidentielle',
])
export const appMaintenance = pgEnum('app_maintenance', [
  'a_jour',
  'en_retard',
  'non_maintenue',
  'fin_de_support',
])
export const authMethode = pgEnum('auth_methode', [
  'oidc_oauth',
  'ldap_ad',
  'cas',
  'comptes_locaux',
  'autre',
])
export const responsabiliteRole = pgEnum('responsabilite_role', [
  'gestionnaire_technique',
  'chef_de_projet',
  'gestionnaire_quotidien',
  'referent_metier',
])

// Entité centrale du catalogue. Tous les champs techniques/déploiement/responsables
// sont optionnels : une app SaaS n'en remplit qu'une poignée, une app métier tout.
export const application = pgTable('application', {
  id: id(),
  nom: text('nom').notNull(),
  description: text('description'),
  categorie: appCategorie('categorie').notNull(),
  categoriePrecision: text('categorie_precision'),
  criticite: appCriticite('criticite'),
  // Durée maximale d'interruption admissible. Avec la criticité, c'est ce couple qui rend
  // l'annexe E et le plan de continuité calculables au lieu d'être rédigés à la main.
  dureeIndisponibiliteTolerable: dureeIndisponibiliteTolerable('duree_indisponibilite_tolerable'),
  statut: appStatut('statut').notNull().default('en_production'),
  hebergement: appHebergement('hebergement'),
  exposition: appExposition('exposition'),
  sensibilite: appSensibilite('sensibilite'),
  donneesPersonnelles: boolean('donnees_personnelles').default(false).notNull(),
  authentification: authMethode('authentification').array(),
  authentificationAutre: text('authentification_autre'),
  openSource: boolean('open_source'),
  devInterne: boolean('dev_interne'),
  maintenueAJour: appMaintenance('maintenue_a_jour'),
  url: text('url'),
  siteWeb: text('site_web'),
  depotUrl: text('depot_url'),
  editeurId: text('editeur_id').references(() => tiers.id, { onDelete: 'set null' }),
  poleId: text('pole_id').references(() => pole.id, { onDelete: 'set null' }),
  responsableId: text('responsable_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  // RESPONSABLE MÉTIER — distinct de `responsableId`, qui est le responsable TECHNIQUE.
  responsableMetierId: text('responsable_metier_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  // Responsable organisationnel (optionnel) : pôle / composante / service / département.
  responsableOrgaType: appResponsableOrgaType('responsable_orga_type'),
  responsableOrgaId: text('responsable_orga_id'),
  dateMiseEnService: date('date_mise_en_service'),
  dateFinDeSupport: date('date_fin_de_support'),
  homologuee: boolean('homologuee').default(false).notNull(),
  dateHomologation: date('date_homologation'),
  dateRevueHomologation: date('date_revue_homologation'),
  ...timestamps(),
})

// Intervenants internes (hors responsable principal, porté par application.responsableId).
export const responsabilite = pgTable(
  'responsabilite',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    personneId: text('personne_id')
      .notNull()
      .references(() => personne.id, { onDelete: 'cascade' }),
    role: responsabiliteRole('role').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('responsabilite_unique').on(t.applicationId, t.personneId, t.role),
  ],
)

// Prestataires intervenant sur l'application (N–N). L'éditeur reste sur application.editeurId.
export const intervention = pgTable(
  'intervention',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    tiersId: text('tiers_id')
      .notNull()
      .references(() => tiers.id, { onDelete: 'cascade' }),
    role: text('role'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('intervention_unique').on(t.applicationId, t.tiersId)],
)

// Populations concernées / autorisées (vue par population = catalogue par profil).
export const applicationPopulation = pgTable(
  'application_population',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    populationId: text('population_id')
      .notNull()
      .references(() => population.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('application_population_unique').on(t.applicationId, t.populationId),
  ],
)

// Groupes AD/LDAP associés (surtout aux apps métiers), vus depuis la fiche app.
export const applicationGroupe = pgTable(
  'application_groupe',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    groupeId: text('groupe_id')
      .notNull()
      .references(() => groupe.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('application_groupe_unique').on(t.applicationId, t.groupeId)],
)
