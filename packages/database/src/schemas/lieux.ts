import { pgTable, pgEnum, text, integer, boolean, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { composante, service, departement } from './organisation'

// Emplacement physique structuré et récursif (Site → Bâtiment → Salle → Baie).
export const lieuType = pgEnum('lieu_type', ['site', 'batiment', 'salle', 'baie'])

export const lieu = pgTable('lieu', {
  id: id(),
  nom: text('nom').notNull(),
  type: lieuType('type').notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => lieu.id, {
    onDelete: 'set null',
  }),
  code: text('code'),
  adresse: text('adresse'),
  nbU: integer('nb_u'),
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  // Créé automatiquement depuis l'arborescence des lieux GLPI. `cheminGlpi` conserve le chemin
  // d'origine complet : il sert de clé de réidentification à chaque synchronisation (les noms
  // de segments seuls ne sont pas uniques — « E005 » peut exister sur 2 sites).
  sourceGlpi: boolean('source_glpi').default(false).notNull(),
  cheminGlpi: text('chemin_glpi'),
  notes: text('notes'),
  ...timestamps(),
})
