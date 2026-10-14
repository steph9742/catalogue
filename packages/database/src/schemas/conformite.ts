import { pgTable, pgEnum, text, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'
import { risqueVraisemblance } from './smsi'

// Compléments exigés par la démarche de certification ISO 27001 : contexte (exigences légales,
// parties intéressées), compétences (clause 7.2), et opportunités (clause 6.1 « risques ET
// opportunités »).

// --- Exigences légales, réglementaires et contractuelles (ISO 27001 A.5.31) ------------
export const exigenceLegaleType = pgEnum('exigence_legale_type', [
  'loi',
  'reglement',
  'directive',
  'contrat',
  'norme',
  'autre',
])
export const exigenceLegaleConformite = pgEnum('exigence_legale_conformite', [
  'conforme',
  'partiellement',
  'non_conforme',
  'a_evaluer',
])

export const exigenceLegale = pgTable('exigence_legale', {
  id: id(),
  intitule: text('intitule').notNull().unique(),
  type: exigenceLegaleType('type'),
  reference: text('reference'),
  source: text('source'),
  applicabilite: text('applicabilite'),
  conformite: exigenceLegaleConformite('conformite'),
  responsableId: text('responsable_id').references(() => personne.id, { onDelete: 'set null' }),
  dateRevue: date('date_revue'),
  lien: text('lien'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Parties intéressées et leurs exigences (ISO 27001 clause 4.2) ---------------------
export const partieInteresseeType = pgEnum('partie_interessee_type', ['interne', 'externe'])
export const partieInteresseeCategorie = pgEnum('partie_interessee_categorie', [
  'autorite',
  'usager',
  'personnel',
  'fournisseur',
  'partenaire',
  'financeur',
  'syndicat',
  'autre',
])
export const niveauInfluence = pgEnum('niveau_influence', ['faible', 'moyenne', 'forte'])

export const partieInteressee = pgTable('partie_interessee', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: partieInteresseeType('type'),
  categorie: partieInteresseeCategorie('categorie'),
  attentes: text('attentes'),
  reponse: text('reponse'),
  influence: niveauInfluence('influence'),
  contactId: text('contact_id').references(() => personne.id, { onDelete: 'set null' }),
  notes: text('notes'),
  ...timestamps(),
})

// --- Compétences (ISO 27001 clause 7.2) : référentiel + matrice personne × compétence --
export const competenceDomaine = pgEnum('competence_domaine', [
  'technique',
  'gouvernance',
  'juridique',
  'gestion_de_projet',
  'sensibilisation',
  'autre',
])
export const competenceNiveau = pgEnum('competence_niveau', [
  'notion',
  'intermediaire',
  'confirme',
  'expert',
])

export const competence = pgTable('competence', {
  id: id(),
  nom: text('nom').notNull().unique(),
  domaine: competenceDomaine('domaine'),
  description: text('description'),
  niveauRequis: competenceNiveau('niveau_requis'),
  notes: text('notes'),
  ...timestamps(),
})

export const personneCompetence = pgTable(
  'personne_competence',
  {
    id: id(),
    personneId: text('personne_id').notNull().references(() => personne.id, { onDelete: 'cascade' }),
    competenceId: text('competence_id').notNull().references(() => competence.id, { onDelete: 'cascade' }),
    niveau: competenceNiveau('niveau'),
    dateEvaluation: date('date_evaluation'),
    notes: text('notes'),
    ...timestamps(),
  },
  t => [uniqueIndex('personne_competence_unique').on(t.personneId, t.competenceId)],
)

// --- Opportunités (ISO 27001 clause 6.1 : risques ET opportunités) ---------------------
export const opportuniteGain = pgEnum('opportunite_gain', [
  'faible',
  'modere',
  'eleve',
  'majeur',
])
export const opportuniteStatut = pgEnum('opportunite_statut', [
  'identifiee',
  'evaluee',
  'en_cours',
  'realisee',
  'abandonnee',
])

export const opportunite = pgTable('opportunite', {
  id: id(),
  nom: text('nom').notNull().unique(),
  description: text('description'),
  origine: text('origine'),
  benefice: text('benefice'),
  vraisemblance: risqueVraisemblance('vraisemblance'),
  gain: opportuniteGain('gain'),
  statut: opportuniteStatut('statut').notNull().default('identifiee'),
  responsableId: text('responsable_id').references(() => personne.id, { onDelete: 'set null' }),
  echeance: date('echeance'),
  notes: text('notes'),
  ...timestamps(),
})
