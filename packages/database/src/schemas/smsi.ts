import { pgTable, pgEnum, text, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'

// Couche SMSI (ISO/IEC 27001 & 27005) — transverse aux 4 cartographies. Le registre « Actif
// SMSI » PROMEUT n'importe quel élément (référence polymorphe typeSource+sourceId) dans le
// périmètre, avec valorisation D/I/C et propriétaire.

// Échelle de valorisation D/I/C (besoin de sécurité) — 4 niveaux.
export const niveauBesoin = pgEnum('niveau_besoin', [
  'faible',
  'modere',
  'eleve',
  'critique',
])

// Nature de l'élément promu (pointe vers l'un des catalogues des 4 cartographies).
export const actifSmsiType = pgEnum('actif_smsi_type', [
  'serveur',
  'application',
  'poste-travail',
  'iot',
  'machine-indus',
  'equipement-reseau',
  'actif-informationnel',
  'processus',
  'personne',
  'lieu',
  'autre',
])

// Catégorie ISO 27005 / EBIOS RM : actif PRIMAIRE (valeur métier : information, processus)
// ou actif SUPPORT (bien support : matériel, logiciel, réseau, personnel, site).
export const actifCategorie = pgEnum('actif_categorie', ['primaire', 'support'])

export const actifSmsi = pgTable('actif_smsi', {
  id: id(),
  nom: text('nom').notNull().unique(),
  typeSource: actifSmsiType('type_source'),
  categorie: actifCategorie('categorie'),
  // Référence polymorphe (id de l'élément source) — renseignée à la promotion.
  sourceId: text('source_id'),
  perimetreSmsi: boolean('perimetre_smsi').default(true).notNull(),
  disponibilite: niveauBesoin('disponibilite'),
  integrite: niveauBesoin('integrite'),
  confidentialite: niveauBesoin('confidentialite'),
  proprietaireId: text('proprietaire_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})

// Dépendances entre actifs (ISO 27005) : « actifId est supporté par supportId ».
export const actifDependance = pgTable(
  'actif_dependance',
  {
    id: id(),
    actifId: text('actif_id')
      .notNull()
      .references(() => actifSmsi.id, { onDelete: 'cascade' }),
    supportId: text('support_id')
      .notNull()
      .references(() => actifSmsi.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  t => [uniqueIndex('actif_dependance_unique').on(t.actifId, t.supportId)],
)

// --- Registre des risques (ISO 27005) ------------------------------------------------
export const risqueVraisemblance = pgEnum('risque_vraisemblance', [
  'rare',
  'possible',
  'probable',
  'quasi_certain',
])
export const risqueGravite = pgEnum('risque_gravite', [
  'mineure',
  'significative',
  'grave',
  'critique',
])
export const risqueTraitement = pgEnum('risque_traitement', [
  'reduire',
  'accepter',
  'transferer',
  'eviter',
])
export const risqueStatut = pgEnum('risque_statut', [
  'identifie',
  'evalue',
  'en_traitement',
  'traite',
  'accepte',
])
// Critère de sécurité atteint par l'événement redouté (sur l'actif primaire).
export const proprieteDic = pgEnum('propriete_dic', [
  'disponibilite',
  'integrite',
  'confidentialite',
])

// Événement redouté (EBIOS RM atelier 1) : atteinte d'un critère D/I/C sur une valeur
// métier (actif primaire), avec sa gravité. Formalise ce que le risque référence.
export const evenementRedoute = pgTable('evenement_redoute', {
  id: id(),
  nom: text('nom').notNull().unique(),
  actifPrimaireId: text('actif_primaire_id').references(() => actifSmsi.id, {
    onDelete: 'set null',
  }),
  critere: proprieteDic('critere'),
  gravite: risqueGravite('gravite'),
  impacts: text('impacts'),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})

export const risqueSmsi = pgTable('risque_smsi', {
  id: id(),
  nom: text('nom').notNull(),
  actifSmsiId: text('actif_smsi_id').references(() => actifSmsi.id, {
    onDelete: 'set null',
  }),
  menace: text('menace'),
  vulnerabilite: text('vulnerabilite'),
  // Événement redouté formalisé (optionnel) — porte la valeur métier + critère + gravité.
  evenementRedouteId: text('evenement_redoute_id').references(() => evenementRedoute.id, {
    onDelete: 'set null',
  }),
  // Critère D/I/C de l'événement redouté sur l'actif primaire (EBIOS RM).
  proprieteImpactee: proprieteDic('propriete_impactee'),
  vraisemblance: risqueVraisemblance('vraisemblance'),
  gravite: risqueGravite('gravite'),
  traitement: risqueTraitement('traitement'),
  statut: risqueStatut('statut').notNull().default('identifie'),
  // Risque résiduel (après application des mesures de traitement) + décision d'acceptation.
  vraisemblanceResiduelle: risqueVraisemblance('vraisemblance_residuelle'),
  graviteResiduelle: risqueGravite('gravite_residuelle'),
  risqueAccepte: boolean('risque_accepte').default(false).notNull(),
  proprietaireId: text('proprietaire_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  ...timestamps(),
})

// Actifs concernés par un risque (N-N) — un scénario peut porter sur plusieurs actifs
// (l'actif primaire reste `risqueSmsi.actifSmsiId` ; ici les actifs supports/concernés).
export const risqueActif = pgTable(
  'risque_actif',
  {
    id: id(),
    risqueSmsiId: text('risque_smsi_id')
      .notNull()
      .references(() => risqueSmsi.id, { onDelete: 'cascade' }),
    actifSmsiId: text('actif_smsi_id')
      .notNull()
      .references(() => actifSmsi.id, { onDelete: 'cascade' }),
    // Vulnérabilité exploitée sur CE bien support dans le scénario (EBIOS RM).
    vulnerabilite: text('vulnerabilite'),
    ...timestamps(),
  },
  t => [uniqueIndex('risque_actif_unique').on(t.risqueSmsiId, t.actifSmsiId)],
)

// --- Mesures / Déclaration d'Applicabilité (SoA, Annexe A 2022) -----------------------
export const mesureTheme = pgEnum('mesure_theme', [
  'organisationnelles',
  'personnes',
  'physiques',
  'technologiques',
])
export const mesureStatut = pgEnum('mesure_statut', [
  'a_faire',
  'en_cours',
  'mise_en_oeuvre',
  'a_ameliorer',
])
// Type de mesure (attribut ISO 27002:2022).
export const mesureType = pgEnum('mesure_type', [
  'preventive',
  'detective',
  'corrective',
])

export const mesureSmsi = pgTable('mesure_smsi', {
  id: id(),
  reference: text('reference').notNull().unique(),
  intitule: text('intitule').notNull(),
  theme: mesureTheme('theme'),
  typeMesure: mesureType('type_mesure'),
  objectif: text('objectif'),
  description: text('description'),
  // Attributs ISO 27002:2022 (multi-valeurs, stockés en texte).
  proprietes: text('proprietes'), // Propriétés de sécurité : C / I / D
  conceptsCyber: text('concepts_cyber'), // Identifier / Protéger / Détecter / Répondre / Récupérer
  capacites: text('capacites'), // Capacités opérationnelles
  applicable: boolean('applicable').default(true).notNull(),
  justification: text('justification'),
  statut: mesureStatut('statut').notNull().default('a_faire'),
  preuve: text('preuve'),
  responsableId: text('responsable_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  ...timestamps(),
})

// Plan de traitement : mesures traitant un risque (N-N) — matrice de couverture
// risque ⇄ mesure. Montre que chaque risque est couvert par des mesures de l'Annexe A.
export const risqueMesure = pgTable(
  'risque_mesure',
  {
    id: id(),
    risqueSmsiId: text('risque_smsi_id')
      .notNull()
      .references(() => risqueSmsi.id, { onDelete: 'cascade' }),
    mesureSmsiId: text('mesure_smsi_id')
      .notNull()
      .references(() => mesureSmsi.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  t => [uniqueIndex('risque_mesure_unique').on(t.risqueSmsiId, t.mesureSmsiId)],
)
