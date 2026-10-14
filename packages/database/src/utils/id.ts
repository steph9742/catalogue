import { init } from '@paralleldrive/cuid2'

// Identifiant court, lisible, sans collision — utilisé comme PK par défaut sur
// toutes les tables du catalogue (les tables better-auth gardent leurs propres id).
export const createId = init({ length: 16 })
