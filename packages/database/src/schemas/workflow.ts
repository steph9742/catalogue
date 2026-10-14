import { pgTable, pgEnum, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { user } from './auth-schema'

// File de validation : les écritures d'un Contributeur y sont déposées en attente
// d'un gestionnaire/admin qui applique (rejoue la requête) ou rejette.
export const changeRequestAction = pgEnum('change_request_action', ['create', 'update', 'delete'])
export const changeRequestStatut = pgEnum('change_request_statut', ['pending', 'approved', 'rejected'])

export const changeRequest = pgTable('change_request', {
  id: id(),
  category: text('category').notNull(),
  action: changeRequestAction('action').notNull(),
  entityId: text('entity_id'),
  method: text('method').notNull(),
  path: text('path').notNull(),
  payload: jsonb('payload'),
  requestedBy: text('requested_by').references(() => user.id, { onDelete: 'set null' }),
  status: changeRequestStatut('status').notNull().default('pending'),
  reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  comment: text('comment'),
  ...timestamps(),
})
