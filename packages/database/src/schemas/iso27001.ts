import { date, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'

// CLAUSES ISO/IEC 27001:2022 — le système de management, suivi clause par clause. À NE PAS
// CONFONDRE AVEC `mesureSmsi`, qui porte les mesures de l'annexe A (ISO 27002) et alimente la
// déclaration d'applicabilité.
export const iso27001Conformite = pgEnum('iso27001_conformite', [
  'conforme',
  'partielle',
  'non_conforme',
  'non_applicable',
])

export const iso27001Statut = pgEnum('iso27001_statut', ['a_faire', 'en_cours', 'fait'])

// PROVENANCE DE L'INTITULÉ FRANÇAIS — traçabilité assumée. Tous les intitulés proviennent
// aujourd'hui de la table des matières officielle française, relevée sur la plateforme de
// consultation en ligne de l'ISO.
export const iso27001SourceIntitule = pgEnum('iso27001_source_intitule', ['officiel', 'traduction'])

export const clauseIso27001 = pgTable('clause_iso27001', {
  id: id(),
  // « 4.1 », « 6.1.2 », « 9.3.3 » — numérotation de la norme, citable telle quelle.
  reference: text('reference').notNull().unique(),
  // Chapitre (4 à 10), pour regrouper sans avoir à découper la référence à l'affichage.
  chapitre: integer('chapitre').notNull(),
  intitule: text('intitule').notNull(),
  // Intitulé anglais conservé : c'est celui de l'édition originale, et il lève les
  // ambiguïtés de traduction lors d'un audit mené en anglais.
  intituleEn: text('intitule_en'),
  sourceIntitule: iso27001SourceIntitule('source_intitule').notNull().default('officiel'),
  // CE QUE LA CLAUSE EXIGE — formulation, PAS citation. Le texte normatif de l'ISO est protégé
  // : l'embarquer serait de la reproduction, pas de la citation.
  exigence: text('exigence'),
  // Amendement applicable, quand la clause en a reçu un. Sans cette mention, le référentiel
  // décrirait l'état de 2022 en laissant croire qu'il est à jour — et l'amendement climat de
  // 2024 ajoute une EXIGENCE à la clause 4.1, pas une simple note.
  amendement: text('amendement'),
  // --- Suivi de la mise en conformité, calqué sur NIS 2 et le RGPD --------------------
  conformite: iso27001Conformite('conformite'),
  plan: text('plan'),
  echeance: date('echeance'),
  statut: iso27001Statut('statut').notNull().default('a_faire'),
  preuve: text('preuve'),
  responsableId: text('responsable_id').references(() => personne.id, { onDelete: 'set null' }),
  notes: text('notes'),
  ordre: integer('ordre').notNull().default(0),
  ...timestamps(),
})
