import { pgTable, text, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { user } from './auth-schema'

// Événements souscrits (clés `<entite>:<action>` ou `echeance:<type>`) — communs
// aux webhooks et aux abonnements push.

export const webhook = pgTable('webhook', {
  id: id(),
  nom: text('nom').notNull(),
  url: text('url').notNull(),
  actif: boolean('actif').default(true).notNull(),
  secret: text('secret'),
  events: text('events').array(),
  ...timestamps(),
})

// Abonnement push d'un navigateur (Web Push).
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: id(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    events: text('events').array(),
    ...timestamps(),
  },
  t => [uniqueIndex('push_subscription_endpoint_unique').on(t.endpoint)],
)
