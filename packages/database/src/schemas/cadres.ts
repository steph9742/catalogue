import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// CADRES DE RÉFÉRENCE ACTIVÉS — quels référentiels l'établissement suit réellement.
export const cadreReferentiel = pgTable('cadre_referentiel', {
  id: id(),
  // Identifiant stable, utilisé par le menu et les pages : ne pas renommer.
  code: text('code').notNull().unique(),
  nom: text('nom').notNull(),
  description: text('description'),
  actif: boolean('actif').notNull().default(true),
  ordre: integer('ordre').notNull().default(0),
  ...timestamps(),
})
