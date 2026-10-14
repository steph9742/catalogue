import { pgTable, pgEnum, text, date, boolean } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'

// Statut de l'entité au regard de NIS 2. C'est un SINGLETON : l'université est UNE entité
// régulée.

export const nis2StatutEntite = pgEnum('nis2_statut_entite', [
  'essentielle',
  'importante',
  'non_assujettie',
  'a_determiner',
])

// Secteurs de la directive (UE) 2022/2555 — annexe I (hautement critiques) et annexe II (autres
// critiques).
export const nis2Secteur = pgEnum('nis2_secteur', [
  'administration_publique',
  'recherche',
  'enseignement_superieur',
  'sante',
  'infrastructure_numerique',
  'gestion_services_tic',
  'eau_potable',
  'eaux_usees',
  'energie',
  'espace',
  'autre',
])

export const entiteNis2 = pgTable('entite_nis2', {
  id: id(),
  statut: nis2StatutEntite('statut').notNull().default('a_determiner'),
  secteur: nis2Secteur('secteur'),
  secteurAutre: text('secteur_autre'),
  // Enregistrement auprès de l'ANSSI (téléservice NIS 2).
  enregistreAnssi: boolean('enregistre_anssi').notNull().default(false),
  identifiantAnssi: text('identifiant_anssi'),
  dateEnregistrement: date('date_enregistrement'),
  // Point de contact réglementaire déclaré.
  referentId: text('referent_id').references(() => personne.id, { onDelete: 'set null' }),
  justificationStatut: text('justification_statut'),
  notes: text('notes'),
  ...timestamps(),
})
