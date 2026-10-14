import { pgTable, pgEnum, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { application } from './applications'

// Flux applicatifs — interconnexions entre applications (cartographie applicative /
// urbanisation SI). Alimente l'analyse d'impact et le futur graphe applicatif.
export const fluxAppProtocole = pgEnum('flux_app_protocole', [
  'https',
  'api_rest',
  'soap',
  'sql',
  'ldap',
  'smtp',
  'fichier',
  'message',
  'autre',
])
export const fluxAppSens = pgEnum('flux_app_sens', [
  'unidirectionnel',
  'bidirectionnel',
])
export const fluxAppFrequence = pgEnum('flux_app_frequence', [
  'temps_reel',
  'frequent',
  'quotidien',
  'hebdomadaire',
  'ponctuel',
])

export const fluxApplicatif = pgTable('flux_applicatif', {
  id: id(),
  nom: text('nom').notNull(),
  sourceApplicationId: text('source_application_id').references(
    () => application.id,
    { onDelete: 'set null' },
  ),
  destinationApplicationId: text('destination_application_id').references(
    () => application.id,
    { onDelete: 'set null' },
  ),
  protocole: fluxAppProtocole('protocole'),
  port: text('port'),
  donnees: text('donnees'),
  sens: fluxAppSens('sens'),
  frequence: fluxAppFrequence('frequence'),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})
