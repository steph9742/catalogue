import { pgTable, pgEnum, text, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { appCriticite, application } from './applications'
import { personne, composante, service, departement } from './organisation'

// Actifs PRIMAIRES au sens ISO 27005 : actifs informationnels (les données que l'on protège) et
// processus métier (ce qui les met en œuvre).

// --- Actifs informationnels / catégories de données ----------------------------------
export const actifDonneeCategorie = pgEnum('actif_donnee_categorie', [
  'donnees_personnelles',
  'rh',
  'scolarite',
  'recherche',
  'financieres',
  'techniques',
  'autre',
])
export const sensibiliteDonnee = pgEnum('sensibilite_donnee', [
  'publique',
  'interne',
  'restreinte',
  'confidentielle',
])

export const actifInformationnel = pgTable('actif_informationnel', {
  id: id(),
  nom: text('nom').notNull().unique(),
  categorie: actifDonneeCategorie('categorie'),
  description: text('description'),
  sensibilite: sensibiliteDonnee('sensibilite'),
  donneesPersonnelles: boolean('donnees_personnelles').default(false).notNull(),
  support: text('support'),
  proprietaireId: text('proprietaire_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  notes: text('notes'),
  ...timestamps(),
})

// --- Processus métier ----------------------------------------------------------------
export const processusDomaine = pgEnum('processus_domaine', [
  'rh',
  'finances',
  'scolarite',
  'recherche',
  'si',
  'pilotage',
  'autre',
])

export const processusMetier = pgTable('processus_metier', {
  id: id(),
  nom: text('nom').notNull().unique(),
  domaine: processusDomaine('domaine'),
  description: text('description'),
  criticite: appCriticite('criticite'),
  proprietaireId: text('proprietaire_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  ...timestamps(),
})

// Pont vers le registre RGPD : applications qui traitent un actif informationnel (N-N).
export const actifInformationApplication = pgTable(
  'actif_information_application',
  {
    id: id(),
    actifInformationnelId: text('actif_informationnel_id')
      .notNull()
      .references(() => actifInformationnel.id, { onDelete: 'cascade' }),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  t => [uniqueIndex('actif_info_app_unique').on(t.actifInformationnelId, t.applicationId)],
)
