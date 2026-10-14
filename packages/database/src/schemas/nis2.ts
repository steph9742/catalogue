import { pgTable, pgEnum, text, integer, boolean, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'
import { mesureSmsi } from './smsi'

// Conformité NIS 2 — référentiel ReCyF (Référentiel Cyber France, ANSSI) v2.5.

// Niveau de recouvrement entre l'exigence ReCyF et les clauses ISO citées, tel qu'évalué
// par l'ANSSI. Valeurs de la source : « élevé », « moyen », « faible ».
export const nis2CorrespondanceIso = pgEnum('nis2_correspondance_iso', [
  'elevee',
  'moyenne',
  'faible',
])

export const nis2Domaine = pgEnum('nis2_domaine', [
  'gouvernance',
  'protection',
  'defense',
  'resilience',
])
export const nis2Applicabilite = pgEnum('nis2_applicabilite', ['ei_ee', 'ee'])

export const objectifNis2 = pgTable('objectif_nis2', {
  id: id(),
  numero: integer('numero').notNull().unique(),
  intitule: text('intitule').notNull(),
  domaine: nis2Domaine('domaine'),
  applicabilite: nis2Applicabilite('applicabilite').notNull().default('ei_ee'),
  rappel: text('rappel'),
  notes: text('notes'),
  ...timestamps(),
})

export const nis2Conformite = pgEnum('nis2_conformite', [
  'fait',
  'partiellement',
  'tres_partiellement',
  'pas_du_tout',
])
export const nis2Statut = pgEnum('nis2_statut', [
  'a_faire',
  'en_cours',
  'fait',
  'non_applicable',
])

export const exigenceNis2 = pgTable('exigence_nis2', {
  id: id(),
  reference: text('reference').notNull().unique(),
  objectifNis2Id: text('objectif_nis2_id').references(() => objectifNis2.id, {
    onDelete: 'cascade',
  }),
  sousSection: text('sous_section'),
  intitule: text('intitule').notNull(),
  // Attendu selon la nature de l'entité (tableau du référentiel).
  attenduEi: boolean('attendu_ei').default(false).notNull(),
  attenduEe: boolean('attendu_ee').default(true).notNull(),
  // --- Correspondance ISO, telle que publiée par l'ANSSI ------------------------------
  // Le NIVEAU de correspondance vaut autant que la liste des mesures : « faible » signale une
  // exigence que l'ISO 27001 ne couvre pas vraiment — c'est là que se trouve le travail
  // supplémentaire pour un établissement déjà certifié, et c'est ce qu'on veut voir en premier.
  correspondanceIso: nis2CorrespondanceIso('correspondance_iso'),
  // Commentaire de l'ANSSI expliquant l'écart (renseigné sur 64 exigences). Recopié
  // verbatim : c'est une source officielle, pas une reformulation.
  observationsIso: text('observations_iso'),
  // --- Suivi de la mise en conformité ---
  conformite: nis2Conformite('conformite'),
  plan: text('plan'),
  echeance: date('echeance'),
  statut: nis2Statut('statut').notNull().default('a_faire'),
  preuve: text('preuve'),
  notes: text('notes'),
  ...timestamps(),
})

// Responsables : plusieurs personnes possibles, côté ORGANISATIONNEL (implémentation)
// et côté TECHNIQUE (mise en place).
export const nis2RoleResponsable = pgEnum('nis2_role_responsable', [
  'implementation',
  'technique',
])

export const exigenceNis2Responsable = pgTable(
  'exigence_nis2_responsable',
  {
    id: id(),
    exigenceNis2Id: text('exigence_nis2_id')
      .notNull()
      .references(() => exigenceNis2.id, { onDelete: 'cascade' }),
    personneId: text('personne_id')
      .notNull()
      .references(() => personne.id, { onDelete: 'cascade' }),
    role: nis2RoleResponsable('role').notNull(),
    ...timestamps(),
  },
  t => [uniqueIndex('exigence_nis2_responsable_unique').on(t.exigenceNis2Id, t.personneId, t.role)],
)

// --- Plan d'actions ---------------------------------------------------------------
// L'exigence porte la conformité DÉCLARÉE (où on en est) ; l'action porte le travail CONCRET
// qui reste à faire pour y arriver.
export const nis2ActionStatut = pgEnum('nis2_action_statut', [
  'a_faire',
  'en_cours',
  'fait',
  'abandonnee',
])
export const nis2ActionPriorite = pgEnum('nis2_action_priorite', [
  'basse',
  'moyenne',
  'haute',
  'critique',
])

export const actionNis2 = pgTable('action_nis2', {
  id: id(),
  exigenceNis2Id: text('exigence_nis2_id')
    .notNull()
    .references(() => exigenceNis2.id, { onDelete: 'cascade' }),
  intitule: text('intitule').notNull(),
  description: text('description'),
  statut: nis2ActionStatut('statut').notNull().default('a_faire'),
  priorite: nis2ActionPriorite('priorite').notNull().default('moyenne'),
  // Deux portages distincts, comme pour l'exigence : qui pilote, et qui met en place.
  responsableId: text('responsable_id').references(() => personne.id, { onDelete: 'set null' }),
  technicienId: text('technicien_id').references(() => personne.id, { onDelete: 'set null' }),
  echeance: date('echeance'),
  dateFait: date('date_fait'),
  preuve: text('preuve'),
  notes: text('notes'),
  ...timestamps(),
})

// Mapping vers les mesures ISO 27002 / SoA (l'ANSSI admet la certification 27001 comme moyen de
// démontrer la conformité aux objectifs 2 et 16).
export const exigenceNis2Iso = pgTable(
  'exigence_nis2_iso',
  {
    id: id(),
    exigenceNis2Id: text('exigence_nis2_id')
      .notNull()
      .references(() => exigenceNis2.id, { onDelete: 'cascade' }),
    // « 27001:2022 » ou « 27002:2022 », tel qu'écrit dans la source.
    norme: text('norme').notNull(),
    // Référence de clause ou de mesure : « 5.9 », « 6.1.2 »…
    reference: text('reference').notNull(),
    intitule: text('intitule').notNull(),
    // Rang dans la table officielle (colonnes « Référence ISO (1) » à « (7) »), pour
    // restituer l'ordre voulu par l'ANSSI plutôt qu'un tri alphabétique.
    ordre: integer('ordre').notNull().default(1),
    ...timestamps(),
  },
  t => [uniqueIndex('exigence_nis2_iso_unique').on(t.exigenceNis2Id, t.norme, t.reference)],
)

export const exigenceNis2Mesure = pgTable(
  'exigence_nis2_mesure',
  {
    id: id(),
    exigenceNis2Id: text('exigence_nis2_id')
      .notNull()
      .references(() => exigenceNis2.id, { onDelete: 'cascade' }),
    mesureSmsiId: text('mesure_smsi_id')
      .notNull()
      .references(() => mesureSmsi.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  t => [uniqueIndex('exigence_nis2_mesure_unique').on(t.exigenceNis2Id, t.mesureSmsiId)],
)
