import { jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { user } from './auth-schema'

// Préférences de navigation, par utilisateur et STOCKÉES EN BASE : elles suivent la personne
// d'un poste à l'autre (contrairement au pliage des sections, resté local).
export const preferenceUtilisateur = pgTable(
  'preference_utilisateur',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    epingles: text('epingles').array(),
    ordreSections: text('ordre_sections').array(),
    // Réglages d'affichage PAR CATALOGUE : mode (cartes ou tableau) et colonnes visibles, dans
    // l'ordre choisi.
    vuesCatalogues: jsonb('vues_catalogues'),
    ...timestamps(),
  },
  t => [uniqueIndex('preference_utilisateur_user_unique').on(t.userId)],
)
