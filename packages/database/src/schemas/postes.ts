import { pgTable, pgEnum, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { population } from './profils'

// Catalogue distinct des applications autorisées sur les postes de travail
// (logiciels endpoint), séparé des applications métiers/IT. Autorisées par population.
export const logicielCategorie = pgEnum('logiciel_categorie', [
  'navigateur',
  'bureautique',
  'messagerie',
  'securite',
  'metier',
  'utilitaire',
  'multimedia',
  'developpement',
  'autre',
])
export const logicielLicence = pgEnum('logiciel_licence', [
  'gratuit',
  'libre',
  'payant',
  'abonnement',
  'autre',
])
export const logicielInstallation = pgEnum('logiciel_installation', [
  'libre_service',
  'sur_demande',
  'deploiement_centralise',
])
export const logicielStatut = pgEnum('logiciel_statut', [
  'autorise',
  'sur_derogation',
  'retire',
])

export const logicielPoste = pgTable('logiciel_poste', {
  id: id(),
  nom: text('nom').notNull(),
  editeur: text('editeur'),
  version: text('version'),
  categorie: logicielCategorie('categorie').notNull(),
  categoriePrecision: text('categorie_precision'),
  description: text('description'),
  typeLicence: logicielLicence('type_licence'),
  typeLicencePrecision: text('type_licence_precision'),
  installation: logicielInstallation('installation'),
  statut: logicielStatut('statut').notNull().default('autorise'),
  url: text('url'),
  notes: text('notes'),
  ...timestamps(),
})

// Populations autorisées à disposer de ce logiciel sur leur poste.
export const logicielPostePopulation = pgTable(
  'logiciel_poste_population',
  {
    id: id(),
    logicielPosteId: text('logiciel_poste_id')
      .notNull()
      .references(() => logicielPoste.id, { onDelete: 'cascade' }),
    populationId: text('population_id')
      .notNull()
      .references(() => population.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('logiciel_poste_population_unique').on(
      t.logicielPosteId,
      t.populationId,
    ),
  ],
)
