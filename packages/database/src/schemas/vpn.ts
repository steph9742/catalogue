import { pgTable, pgEnum, text, boolean, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { tiers } from './tiers'
import { personne } from './organisation'
import { application } from './applications'

export const vpnStatut = pgEnum('vpn_statut', [
  'actif',
  'suspendu',
  'expire',
  'revoque',
  'en_attente',
])

// Accès VPN d'un tiers externe (IT ou non-IT). La passerelle est toujours la même,
// on ne la stocke pas ; on suit qui, quand ça expire et à quoi ça donne accès.
export const accesVpn = pgTable('acces_vpn', {
  id: id(),
  tiersId: text('tiers_id')
    .notNull()
    .references(() => tiers.id, { onDelete: 'cascade' }),
  identifiant: text('identifiant'),
  perimetre: text('perimetre'),
  mfa: boolean('mfa').default(false).notNull(),
  statut: vpnStatut('statut').notNull().default('actif'),
  dateOuverture: date('date_ouverture'),
  dateExpiration: date('date_expiration'),
  dateDerniereRevue: date('date_derniere_revue'),
  motif: text('motif'),
  valideParId: text('valide_par_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  ...timestamps(),
})

// Applications/ressources ciblées par un accès VPN (optionnel).
export const accesVpnApplication = pgTable(
  'acces_vpn_application',
  {
    id: id(),
    accesVpnId: text('acces_vpn_id')
      .notNull()
      .references(() => accesVpn.id, { onDelete: 'cascade' }),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('acces_vpn_application_unique').on(t.accesVpnId, t.applicationId),
  ],
)
