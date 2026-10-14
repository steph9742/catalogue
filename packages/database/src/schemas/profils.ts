import { pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// Population : catégorie de public (enseignant-chercheur, BIATSS, étudiant…).
// A son propre catalogue d'applications autorisées (surtout non-métiers).
export const population = pgTable('population', {
  id: id(),
  nom: text('nom').notNull().unique(),
  description: text('description'),
  ...timestamps(),
})

// Groupe AD/LDAP : pas de catalogue propre, sert uniquement à être associé
// à des applications métiers.
export const groupe = pgTable('groupe', {
  id: id(),
  nom: text('nom').notNull(),
  refGroupeAd: text('ref_groupe_ad'),
  description: text('description'),
  ...timestamps(),
})
