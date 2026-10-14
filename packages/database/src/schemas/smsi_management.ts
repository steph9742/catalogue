import { pgTable, pgEnum, text, date, integer, boolean } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'

// Système de management de la sécurité (ISO/IEC 27001, clauses 4 à 10) — la partie «
// gouvernance / PDCA » au-dessus des mesures : objectifs (6.2), information documentée (7.5),
// audits internes (9.2), revues de direction (9.3), non-conformités & actions (10).

// --- Objectifs de sécurité (6.2) -----------------------------------------------------
export const objectifStatut = pgEnum('objectif_statut', [
  'a_faire',
  'en_cours',
  'atteint',
  'abandonne',
])

export const objectifSmsi = pgTable('objectif_smsi', {
  id: id(),
  nom: text('nom').notNull().unique(),
  description: text('description'),
  indicateur: text('indicateur'),
  cible: text('cible'),
  echeance: date('echeance'),
  statut: objectifStatut('statut').notNull().default('a_faire'),
  avancement: integer('avancement'),
  responsableId: text('responsable_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  ...timestamps(),
})

// --- Documents du SMSI (7.5 information documentée) ----------------------------------
export const documentType = pgEnum('document_type', [
  'politique',
  'procedure',
  'instruction',
  'enregistrement',
  'guide',
  'autre',
])
export const documentStatut = pgEnum('document_statut', [
  'brouillon',
  'en_validation',
  'valide',
  'en_revision',
  'obsolete',
])

export const documentSmsi = pgTable('document_smsi', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: documentType('type'),
  version: text('version'),
  statut: documentStatut('statut').notNull().default('brouillon'),
  dateRevue: date('date_revue'),
  responsableId: text('responsable_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  lien: text('lien'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Audits (9.2) --------------------------------------------------------------------
export const auditType = pgEnum('audit_type', [
  'interne',
  'externe',
  'certification',
])
export const auditStatut = pgEnum('audit_statut', [
  'planifie',
  'en_cours',
  'realise',
  'cloture',
])

export const auditSmsi = pgTable('audit_smsi', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: auditType('type'),
  perimetre: text('perimetre'),
  dateDebut: date('date_debut'),
  dateFin: date('date_fin'),
  auditeur: text('auditeur'),
  statut: auditStatut('statut').notNull().default('planifie'),
  conclusions: text('conclusions'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Revues de direction (9.3) -------------------------------------------------------
export const revueStatut = pgEnum('revue_statut', ['planifiee', 'realisee'])

export const revueDirection = pgTable('revue_direction', {
  id: id(),
  nom: text('nom').notNull().unique(),
  date: date('date'),
  participants: text('participants'),
  decisions: text('decisions'),
  statut: revueStatut('statut').notNull().default('planifiee'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Non-conformités & actions (10) --------------------------------------------------
export const ncSource = pgEnum('nc_source', [
  'audit',
  'incident',
  'revue',
  'veille',
  'autre',
])
export const ncType = pgEnum('nc_type', ['non_conformite', 'action_amelioration'])
export const ncGravite = pgEnum('nc_gravite', ['mineure', 'majeure'])
export const ncStatut = pgEnum('nc_statut', ['ouverte', 'en_cours', 'close'])

export const nonConformite = pgTable('non_conformite', {
  id: id(),
  nom: text('nom').notNull().unique(),
  source: ncSource('source'),
  type: ncType('type').notNull().default('non_conformite'),
  description: text('description'),
  gravite: ncGravite('gravite'),
  responsableId: text('responsable_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  echeance: date('echeance'),
  statut: ncStatut('statut').notNull().default('ouverte'),
  efficaciteVerifiee: boolean('efficacite_verifiee').default(false).notNull(),
  notes: text('notes'),
  ...timestamps(),
})
