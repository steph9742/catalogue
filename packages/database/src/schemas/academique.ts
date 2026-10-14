import { pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// Sections CNU (Conseil National des Universités) — nomenclature disciplinaire nationale des
// enseignants-chercheurs (source : Galaxie / MESR).
export const sectionCnu = pgTable('section_cnu', {
  id: id(),
  numero: text('numero').notNull().unique(),
  intitule: text('intitule').notNull(),
  groupe: text('groupe'),
  ...timestamps(),
})
