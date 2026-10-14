import { pgTable, pgEnum, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { id } from './_shared'
import { user } from './auth-schema'

export const auditAction = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'import',
])

// Journal d'audit : toute écriture sur les catalogues (qui, quoi, quand).
export const auditLog = pgTable('audit_log', {
  id: id(),
  entite: text('entite').notNull(),
  entiteId: text('entite_id').notNull(),
  action: auditAction('action').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  diff: jsonb('diff'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ANNULATION D'UNE ACTION GROUPÉE. Une action de masse n'est acceptable que si elle est
// réversible : sans annulation, personne n'ose sélectionner 7 000 machines et cliquer.
export const annulationLotType = pgEnum('annulation_lot_type', ['modification', 'suppression'])

export const annulationLot = pgTable('annulation_lot', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Catalogue concerné (nom d'endpoint : 'serveurs', 'postes-travail'…).
  endpoint: text('endpoint').notNull(),
  type: annulationLotType('type').notNull(),
  // Pour une modification : [{ id, valeurs }] — seuls les champs modifiés.
  // Pour une suppression : les lignes complètes, telles qu'il faut les réinsérer.
  contenu: jsonb('contenu').notNull(),
  lignes: text('lignes').notNull(), // nombre de lignes, en texte pour rester simple
  creePar: text('cree_par'),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
})
