import { pgTable, pgEnum, text, integer } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { actifSmsi, evenementRedoute, risqueGravite, risqueVraisemblance } from './smsi'

// EBIOS Risk Manager — ateliers 2, 3 et 4 (le socle de l'atelier 1 vit déjà dans `smsi.ts` :
// valeurs métier = actifs primaires, biens supports, événements redoutés ; et l'atelier 5 =
// registre des risques + mesures/SoA).

// --- Atelier 2 : sources de risque / objectifs visés --------------------------------
// Une ligne = un COUPLE « source de risque × objectif visé » (approche simplifiée courante).
export const sourceRisqueCategorie = pgEnum('source_risque_categorie', [
  'etatique',
  'crime_organise',
  'terroriste',
  'ideologue_hacktiviste',
  'officine_privee',
  'amateur',
  'vengeur',
  'malveillant_interne',
  'concurrent',
  'autre',
])

// Décision sur le couple SR/OV à l'issue de l'évaluation (motivation × ressources ×
// activité). « à surveiller » = non prioritaire mais gardé en vigilance.
export const sourceRisquePertinence = pgEnum('source_risque_pertinence', [
  'ecartee',
  'a_surveiller',
  'retenue',
])

export const sourceRisque = pgTable('source_risque', {
  id: id(),
  nom: text('nom').notNull().unique(),
  categorie: sourceRisqueCategorie('categorie'),
  // Objectif visé (OV) poursuivi par la source dans ce couple.
  objectifVise: text('objectif_vise'),
  // Évaluation EBIOS (échelles 1-4) : motivation, ressources, activité (pertinence).
  motivation: integer('motivation'),
  ressources: integer('ressources'),
  activite: integer('activite'),
  pertinence: sourceRisquePertinence('pertinence'),
  justification: text('justification'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Atelier 3 : cartographie de l'écosystème (parties prenantes) --------------------
// Chaque partie prenante est évaluée par 4 critères (1-4). Le niveau de menace se déduit :
// exposition = dépendance × pénétration ; fiabilité cyber = maturité × confiance ; menace =
// exposition / fiabilité.
export const partiePrenanteType = pgEnum('partie_prenante_type', [
  'fournisseur',
  'prestataire_it',
  'partenaire',
  'client',
  'filiale',
  'entite_interne',
  'autre',
])

export const partiePrenante = pgTable('partie_prenante', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: partiePrenanteType('type'),
  // Critères EBIOS (1 = négligeable … 4 = critique).
  dependance: integer('dependance'),
  penetration: integer('penetration'),
  maturiteCyber: integer('maturite_cyber'),
  confiance: integer('confiance'),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Atelier 3 : scénarios stratégiques ---------------------------------------------
// Chemin d'attaque de haut niveau : une source de risque retenue atteint un événement redouté
// (valeur métier), éventuellement en passant par une partie prenante de l'écosystème (vecteur)
// — sinon chemin direct.
export const scenarioStrategique = pgTable('scenario_strategique', {
  id: id(),
  nom: text('nom').notNull().unique(),
  sourceRisqueId: text('source_risque_id').references(() => sourceRisque.id, { onDelete: 'set null' }),
  evenementRedouteId: text('evenement_redoute_id').references(() => evenementRedoute.id, { onDelete: 'set null' }),
  // Partie prenante servant de vecteur (NULL = chemin d'attaque direct).
  partiePrenanteId: text('partie_prenante_id').references(() => partiePrenante.id, { onDelete: 'set null' }),
  gravite: risqueGravite('gravite'),
  cheminAttaque: text('chemin_attaque'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Atelier 4 : scénarios opérationnels --------------------------------------------
// Déclinaison technique d'un scénario stratégique : la séquence d'attaque (connaître, rentrer,
// trouver, exploiter…) sur les biens supports, avec sa vraisemblance.
export const scenarioOperationnel = pgTable('scenario_operationnel', {
  id: id(),
  nom: text('nom').notNull().unique(),
  scenarioStrategiqueId: text('scenario_strategique_id')
    .notNull()
    .references(() => scenarioStrategique.id, { onDelete: 'cascade' }),
  bienSupportId: text('bien_support_id').references(() => actifSmsi.id, { onDelete: 'set null' }),
  vraisemblance: risqueVraisemblance('vraisemblance'),
  // Séquence d'attaque décrite (mode opératoire / kill chain).
  sequence: text('sequence'),
  modeOperatoire: text('mode_operatoire'),
  notes: text('notes'),
  ...timestamps(),
})
