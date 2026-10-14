import { pgTable, pgEnum, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { user } from './auth-schema'

// Rôle d'un utilisateur sur une catégorie (catalogue). Absence de ligne = aucun accès.
// Le rôle global `admin` (SSO) court-circuite et donne tout.
export const categoryRole = pgEnum('category_role', [
  'lecteur',
  'contributeur',
  'gestionnaire',
])

export const userCategoryRole = pgTable(
  'user_category_role',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    role: categoryRole('role').notNull(),
    ...timestamps(),
  },
  t => [uniqueIndex('user_category_role_unique').on(t.userId, t.category)],
)
