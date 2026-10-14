import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, date, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { serviceExpose } from './services_exposes'

// AUDIT DE SURFACE EXTERNE — ce que le Catalogue garde des relevés du moteur.

export const auditSyncStatut = pgEnum('audit_sync_statut', ['jamais', 'ok', 'erreur', 'en_cours'])

/**
 * COMMENT LE CONNECTEUR PARLE AU MOTEUR. C'est la cible.
 */
export const auditDialecte = pgEnum('audit_dialecte', ['contrat', 'artemis'])

export const connecteurAudit = pgTable('connecteur_audit', {
  id: id(),
  // Adresse du moteur, sans chemin final. https obligatoire hors adresse locale.
  url: text('url'),
  // Jeton de service du Catalogue auprès du moteur, CHIFFRÉ (utils/secrets.ts).
  jeton: text('jeton'),
  actif: boolean('actif').notNull().default(false),
  dialecte: auditDialecte('dialecte').notNull().default('contrat'),
  frequenceHeures: integer('frequence_heures').notNull().default(24),
  /**
   * LE PÉRIMÈTRE AUTORISÉ, déclaré et non déduit. Déduire les domaines des noms d'hôtes
   * inventoriés étendrait le relevé à tout ce qu'on a saisi un jour, y compris chez des
   * prestataires qui n'ont rien accepté.
   */
  domaines: jsonb('domaines').$type<string[]>(),
  plages: jsonb('plages').$type<string[]>(),
  /** Date du relevé le plus récent intégré : le prochain appel demande ce qui a suivi. */
  curseur: timestamp('curseur'),
  dernierSyncAt: timestamp('dernier_sync_at'),
  dernierStatut: auditSyncStatut('dernier_statut').notNull().default('jamais'),
  dernierMessage: text('dernier_message'),
  dernierComptes: jsonb('dernier_comptes'),
  ...timestamps(),
})

// Une valeur hors liste est REFUSÉE à la lecture et comptée, pas rangée en « autre » : le
// format est versionné, et une valeur inconnue signale un moteur et un Catalogue qui ne parlent
// plus la même version.
export const constatCategorie = pgEnum('constat_categorie', [
  'certificat', 'tls', 'entete', 'fichier_expose', 'outil_expose', 'version',
  'vulnerabilite', 'dns', 'reputation', 'integrite_script', 'compromission',
  'classement', 'decouverte',
  // UN PORT OUVERT EST UN FAIT, pas un écart, et il n'entrait dans aucune des douze autres.
  'port',
])

export const constatGravite = pgEnum('constat_gravite', ['critique', 'elevee', 'moyenne', 'faible', 'info'])

/**
 * CYCLE DE VIE d'un constat. `ouvert` — vu, rien décidé.
 */
export const constatStatut = pgEnum('constat_statut', ['ouvert', 'accepte', 'corrige', 'reteste'])

/** Le sort d'une DÉCOUVERTE. Jamais inscrite automatiquement comme service. */
export const decouverteTraitement = pgEnum('decouverte_traitement', ['a_valider', 'inscrit', 'ecarte', 'deja_inventorie'])

export const constat = pgTable('constat', {
  id: id(),
  /** Empreinte fournie par le moteur : un même constat vu deux semaines de suite reste UN constat. */
  cleStable: text('cle_stable').notNull(),
  actifHote: text('actif_hote').notNull(),
  actifPort: integer('actif_port'),
  actifUrl: text('actif_url'),
  /** Le service inventorié correspondant, quand il existe. `null` n'est pas une erreur. */
  serviceId: text('service_id').references(() => serviceExpose.id, { onDelete: 'set null' }),
  categorie: constatCategorie('categorie').notNull(),
  gravite: constatGravite('gravite').notNull(),
  titre: text('titre').notNull(),
  detail: text('detail'),
  preuve: text('preuve'),
  reference: text('reference'),
  premierReleveLe: timestamp('premier_releve_le').notNull(),
  dernierReleveLe: timestamp('dernier_releve_le').notNull(),
  observations: integer('observations').notNull().default(1),

  statut: constatStatut('statut').notNull().default('ouvert'),
  acceptationMotif: text('acceptation_motif'),
  acceptationEcheance: date('acceptation_echeance'),
  corrigeLe: timestamp('corrige_le'),
  retesteLe: timestamp('reteste_le'),
  /** Dernière réouverture : une correction qui n'a pas tenu se voit, elle ne s'efface pas. */
  reouvertLe: timestamp('reouvert_le'),
  decisionPar: text('decision_par'),
  decisionLe: timestamp('decision_le'),

  // Réservé aux constats de catégorie `decouverte`.
  traitement: decouverteTraitement('traitement'),
  traitementMotif: text('traitement_motif'),

  // L'INCIDENT SNIFF auquel le constat a donné lieu. Le Catalogue RELIE, il ne crée pas : le
  // connecteur Sniff est en lecture seule.
  sniffIncidentId: text('sniff_incident_id'),
  incidentLiePar: text('incident_lie_par'),
  incidentLieLe: timestamp('incident_lie_le'),
  ...timestamps(),
}, t => [
  uniqueIndex('constat_cle_stable_unique').on(t.cleStable),
  index('constat_statut_idx').on(t.statut),
  index('constat_service_idx').on(t.serviceId),
  index('constat_categorie_idx').on(t.categorie),
])

/**
 * DOMAINES SURVEILLÉS — d'où partent les découvertes par Certificate Transparency.
 */
export const domaineSurveille = pgTable('domaine_surveille', {
  id: id(),
  nom: text('nom').notNull().unique(),
  note: text('note'),
  actif: boolean('actif').notNull().default(true),
  // TRANSFERT DE ZONE (AXFR). Vide : pas de transfert, Certificate Transparency seulement.
  serveurDns: text('serveur_dns'),
  tsigNom: text('tsig_nom'),
  tsigAlgorithme: text('tsig_algorithme'),
  tsigSecret: text('tsig_secret'),
  dernierReleveLe: timestamp('dernier_releve_le'),
  dernierStatut: auditSyncStatut('dernier_statut').notNull().default('jamais'),
  dernierMessage: text('dernier_message'),
  dernierComptes: jsonb('dernier_comptes'),
  ...timestamps(),
})
