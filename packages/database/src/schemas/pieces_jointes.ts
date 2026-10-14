import { pgTable, text, integer, customType, index } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { user } from './auth-schema'

// Pièces jointes — les PREUVES du SMSI et de la conformité NIS 2 (politiques signées, captures
// de configuration, rapports d'audit, comptes rendus…).
const bytea = customType<{ data: Buffer, driverData: Buffer }>({
  dataType: () => 'bytea',
})

export const pieceJointe = pgTable('piece_jointe', {
  id: id(),
  typeSource: text('type_source').notNull(),
  sourceId: text('source_id').notNull(),
  nom: text('nom').notNull(),
  mimeType: text('mime_type'),
  taille: integer('taille').notNull(),
  contenu: bytea('contenu').notNull(),
  description: text('description'),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  ...timestamps(),
}, t => [index('piece_jointe_source_idx').on(t.typeSource, t.sourceId)])
