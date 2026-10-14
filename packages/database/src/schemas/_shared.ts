import { pgEnum, text, timestamp } from 'drizzle-orm/pg-core'
import { createId } from '../utils/id'

// COUVERTURE DE DÉTECTION — par quels moyens un actif est surveillé. Placée ici parce qu'elle
// traverse les inventaires (serveurs, postes, et demain d'autres) sans appartenir à aucun : la
// rattacher à l'un d'eux créerait une dépendance arbitraire entre deux fichiers de schéma.
export const couvertureDetection = pgEnum('couverture_detection', [
  'soc_externe',
  'wazuh',
  'epp',
  'aucune',
])

// Fabriques de colonnes réutilisables. Ce sont des fonctions (et non des objets
// partagés) pour renvoyer un builder frais à chaque table.
export const id = () => text('id').primaryKey().$defaultFn(() => createId())

export const timestamps = () => ({
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})
