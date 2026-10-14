import { pgTable, pgEnum, text, boolean, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { personne } from './organisation'

// Notification d'incidents NIS 2 (art. 23 de la directive (UE) 2022/2555) — suivi des délais
// réglementaires de déclaration à l'ANSSI pour un incident IMPORTANT : • Alerte précoce (early
// warning) ......

// « non_applicable » = décision humaine : l'incident, bien qu'importé (automatiquement pour les
// gravités critique/élevée), n'est finalement PAS un incident significatif au sens de l'art.
export const notificationNis2Statut = pgEnum('notification_nis2_statut', [
  'ouverte',
  'en_cours',
  'close',
  'non_applicable',
])

// ORIGINE DE LA DATE DE PRISE DE CONNAISSANCE. Les trois délais de l'article 23 courent depuis
// cette date : s'y tromper décale tout le dispositif, et toujours dans le sens rassurant.
export const nis2OrigineDateDetection = pgEnum('nis2_origine_date_detection', [
  'connaissance',
  'detection',
  'creation',
  'saisie',
])

export const notificationIncidentNis2 = pgTable('notification_incident_nis2', {
  id: id(),
  // Identifiant de l'incident source côté Slowpoke (NULL = suivi saisi manuellement).
  incidentExterneId: text('incident_externe_id'),
  libelle: text('libelle').notNull(),
  gravite: text('gravite'),
  significatif: boolean('significatif').notNull().default(true),
  // Prise de connaissance : fait courir les délais 24 h / 72 h / 1 mois.
  dateDetection: timestamp('date_detection').notNull(),
  // Vrai quand `dateDetection` est une approximation. Une date estimée SIGNALÉE reste
  // exploitable ; une date fausse présentée comme sûre ne l'est pas — et c'est elle qui ferait
  // manquer une échéance en croyant l'avoir tenue.
  dateDetectionEstimee: boolean('date_detection_estimee').notNull().default(false),
  dateDetectionOrigine: nis2OrigineDateDetection('date_detection_origine'),
  // Jalons de déclaration (horodatage de réalisation + référence ANSSI).
  alertePrecoceAt: timestamp('alerte_precoce_at'),
  alertePrecoceRef: text('alerte_precoce_ref'),
  notificationAt: timestamp('notification_at'),
  notificationRef: text('notification_ref'),
  rapportFinalAt: timestamp('rapport_final_at'),
  rapportFinalRef: text('rapport_final_ref'),
  statut: notificationNis2Statut('statut').notNull().default('ouverte'),
  referentId: text('referent_id').references(() => personne.id, { onDelete: 'set null' }),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Compteurs réglementaires, MIROIR DE SNIFF ------------------------------------------
// Le Catalogue ne décide plus rien sur les compteurs de l'article 23. Il lit, il archive, il
// alerte.

export const sniffIncident = pgTable('sniff_incident', {
  // L'identifiant de Sniff fait office de clé : c'est lui qui circule entre les deux
  // applications, et le Catalogue n'a aucune raison d'en inventer un autre.
  incidentId: text('incident_id').primaryKey(),
  type: text('type'),
  severity: text('severity'),
  niveau: text('niveau'), // P1..P4, tel que Sniff le dérive
  statut: text('statut'),
  // Prise de connaissance par l'ÉTABLISSEMENT : le point de départ de tous les compteurs.
  // Estimée quand la date exacte est inconnue — et le dire change la lecture d'un retard.
  knowledgeAt: timestamp('knowledge_at'),
  knowledgeEstimated: boolean('knowledge_estimated'),
  vuAuSync: timestamp('vu_au_sync').notNull().defaultNow(),
  ...timestamps(),
})

export const sniffEcheance = pgTable('sniff_echeance', {
  id: id(),
  incidentId: text('incident_id').notNull(),
  cle: text('cle').notNull(),
  nom: text('nom'),
  delaiHeures: integer('delai_heures'),
  depart: text('depart'),
  // TEXTE, et il CHANGE selon les réglages de Sniff — un P2 armé d'office porte une autre
  // phrase.
  condition: text('condition'),
  porteur: text('porteur'),

  // Ce que la grille prévoit, AVANT toute décision humaine.
  defaut: text('defaut'),
  // La décision prise, ou `null` si personne n'a tranché. Les deux sont conservés séparément :
  // les fusionner effacerait la différence entre « la grille dit oui » et « quelqu'un a décidé
  // oui », qui est justement ce qu'un dossier doit pouvoir montrer.
  applicable: boolean('applicable'),
  decidePar: text('decide_par'),
  decideLe: timestamp('decide_le'),

  // LE champ qui répond à « ce compteur doit-il être surveillé maintenant » : applicable
  // ET rien de déposé. Repris tel quel de Sniff, jamais recalculé.
  court: boolean('court').notNull().default(false),
  echeance: timestamp('echeance'),

  // Ce qui a effectivement été déposé, et sous quelle référence. Saisi dans Sniff, pendant la
  // conduite, par la personne qui conduit.
  deposeLe: timestamp('depose_le'),
  reference: text('reference'),
  deposePar: text('depose_par'),

  vuAuSync: timestamp('vu_au_sync').notNull().defaultNow(),
  ...timestamps(),
}, t => [
  uniqueIndex('sniff_echeance_unique').on(t.incidentId, t.cle),
  // L'accès principal : « qu'est-ce qui court, et pour quand ».
  index('sniff_echeance_court_idx').on(t.court, t.echeance),
])
