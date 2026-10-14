import { pgTable, pgEnum, text, boolean, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'

export const tiersType = pgEnum('tiers_type', [
  'prestataire_it',
  'prestataire_non_it',
  'editeur',
])
export const tiersNiveauAcces = pgEnum('tiers_niveau_acces', [
  'aucun',
  'ponctuel',
  'permanent',
])
export const referentRole = pgEnum('referent_role', [
  'contractuel',
  'technique',
  'autre',
])

// Société externe : prestataire IT, prestataire non-IT, ou éditeur.
export const tiers = pgTable('tiers', {
  id: id(),
  nom: text('nom').notNull(),
  type: tiersType('type').notNull(),
  activite: text('activite'),
  contratRef: text('contrat_ref'),
  contratFin: date('contrat_fin'),
  niveauAcces: tiersNiveauAcces('niveau_acces'),
  notesSecurite: text('notes_securite'),
  // --- Chaîne d'approvisionnement (NIS 2, art. 21.2.d) -------------------------------
  // La directive fait porter à l'entité la sécurité de ses FOURNISSEURS DIRECTS.
  critiqueNis2: boolean('critique_nis2').default(false).notNull(),
  // Accord de traitement des données signé (RGPD art. 28). Booléen assumé : « signé ou
  // non » est la seule question à laquelle un contrôle demande une réponse nette.
  dpaSigne: boolean('dpa_signe').default(false).notNull(),
  clausesSecurite: text('clauses_securite'),
  // Dernière revue du tiers. Alimente le moteur d'échéances au même titre que `contratFin`.
  dateRevue: date('date_revue'),
  ...timestamps(),
})

// Contact(s) chez le prestataire — minimum 1 exigé côté formulaire/API/import.
export const contact = pgTable('contact', {
  id: id(),
  tiersId: text('tiers_id')
    .notNull()
    .references(() => tiers.id, { onDelete: 'cascade' }),
  nom: text('nom').notNull(),
  email: text('email'),
  telephone: text('telephone'),
  fonction: text('fonction'),
  principal: boolean('principal').default(false).notNull(),
  ...timestamps(),
})

// Référent(s) interne(s) univ pour ce tiers — minimum 1 exigé (règle applicative).
export const tiersReferent = pgTable(
  'tiers_referent',
  {
    id: id(),
    tiersId: text('tiers_id')
      .notNull()
      .references(() => tiers.id, { onDelete: 'cascade' }),
    personneId: text('personne_id')
      .notNull()
      .references(() => personne.id, { onDelete: 'cascade' }),
    role: referentRole('role'),
    principal: boolean('principal').default(false).notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('tiers_referent_unique').on(t.tiersId, t.personneId)],
)
