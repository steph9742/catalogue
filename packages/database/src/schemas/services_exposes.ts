import { pgTable, pgEnum, text, integer, boolean, timestamp, date, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { appCriticite, application } from './applications'
import { serveur, technologie } from './infrastructure'
import { tiers } from './tiers'
import { personne } from './organisation'

// SERVICES EXPOSÉS — « Sites et services » dans l'interface. POURQUOI CET OBJET.

/**
 * Le TYPE porte ce qu'on doit attendre du scan. Sans lui, « aucune technologie détectée » sur
 * un annuaire se lirait comme un trou d'inventaire, alors que c\'est une propriété de l\'objet :
 * un serveur LDAP n'a ni CMS ni en-tête HTTP.
 */
export const serviceType = pgEnum('service_type', [
  'web',
  'messagerie',
  'annuaire',
  'autre',
])

/**
 * `null` : non classé — ce n'est pas « standard ». Le même type porte la proposition du moteur
 * et la valeur validée, gardées à part.
 */
export const serviceClassement = pgEnum('service_classement', ['paiement', 'sensible', 'standard'])

export const serviceExpose = pgTable('service_expose', {
  id: id(),
  // Clé fonctionnelle, la même que celle des certificats : un service est un couple
  // (hôte, port). Deux ports sur le même hôte sont deux services distincts.
  hote: text('hote').notNull(),
  port: integer('port').notNull().default(443),
  libelle: text('libelle'),
  type: serviceType('type').notNull().default('web'),

  /**
   * Rattachement à une application : FACULTATIF. La fiche fonctionne seule, et un service non
   * rattaché n'est pas un défaut.
   */
  applicationId: text('application_id').references(() => application.id, { onDelete: 'set null' }),
  /**
   * PROPRIÉTAIRE : obligatoire à la saisie, pas en base. Les services déjà inventoriés n'en ont
   * pas, et une contrainte NOT NULL obligerait à en inventer un.
   */
  proprietaireId: text('proprietaire_id').references(() => personne.id, { onDelete: 'set null' }),

  // --- Exposition : qui répond, pourquoi c'est exposé, quand on le revoit ----------------
  contactTechniqueId: text('contact_technique_id').references(() => personne.id, { onDelete: 'set null' }),
  /** Hébergeur ou prestataire. */
  tiersId: text('tiers_id').references(() => tiers.id, { onDelete: 'set null' }),
  serveurId: text('serveur_id').references(() => serveur.id, { onDelete: 'set null' }),
  criticite: appCriticite('criticite'),
  justificationExposition: text('justification_exposition'),
  /** Prochaine revue d'exposition (`YYYY-MM-DD`). */
  dateRevue: date('date_revue'),
  derniereRevueLe: timestamp('derniere_revue_le'),
  derniereRevuePar: text('derniere_revue_par'),
  // Marqueurs : `null` = non renseigné, distinct de `false` = renseigné « non ».
  paiementEnLigne: boolean('paiement_en_ligne'),
  donneesPersonnelles: boolean('donnees_personnelles'),
  // Classement VALIDÉ, avec son auteur : c'est lui qui déclenche.
  classement: serviceClassement('classement'),
  classementValidePar: text('classement_valide_par'),
  classementValideLe: timestamp('classement_valide_le'),
  // Proposition du moteur, avec sa preuve : elle ne déclenche rien tant qu'on ne l'a pas relue.
  classementPropose: serviceClassement('classement_propose'),
  classementPreuve: text('classement_preuve'),
  classementProposeLe: timestamp('classement_propose_le'),

  // `null` : jamais vérifié — et la fiche le dit.
  verificationInterieureLe: timestamp('verification_interieure_le'),
  verificationInterieurePar: text('verification_interieure_par'),
  verificationInterieureMethode: text('verification_interieure_methode'),
  verificationInterieureNote: text('verification_interieure_note'),

  surveille: boolean('surveille').notNull().default(true),
  notes: text('notes'),

  // --- Dernier relevé applicatif -------------------------------------------------------
  // `dernierScanAt` à null signifie JAMAIS SCANNÉ, et non « scan sans résultat ». Les
  // pastilles valent alors « inconnu » : aucune conclusion n'est possible sur ce service.
  dernierScanAt: timestamp('dernier_scan_at'),
  dernierStatut: text('dernier_statut'),
  dernierMessage: text('dernier_message'),
  codeHttp: integer('code_http'),

  // --- En-têtes de sécurité ------------------------------------------------------------
  // Factuels et binaires : présents ou absents, sans interprétation. C'est le meilleur rapport
  // valeur sur risque du scan — aucun faux positif possible.
  hsts: boolean('hsts'),
  csp: boolean('csp'),
  xFrameOptions: boolean('x_frame_options'),
  referrerPolicy: boolean('referrer_policy'),

  ...timestamps(),
}, t => [
  uniqueIndex('service_expose_hote_port_unique').on(t.hote, t.port),
  index('service_expose_application_idx').on(t.applicationId),
])

/**
 * CERTITUDE DE LA DÉTECTION, déclarée et non supposée. Une version lue dans `<meta
 * name="generator">` est écrite par le site ; un produit déduit d'un chemin d'actif est une
 * présomption.
 */
export const detectionCertitude = pgEnum('detection_certitude', [
  'certain',
  'probable',
  'absente',
])

/** D'où vient l\'information : sert à juger ce qu\'elle vaut. */
export const detectionSource = pgEnum('detection_source', [
  'entete_server',
  'entete_powered_by',
  'meta_generator',
  'chemin_actif',
  'sonde_produit', 'manuel',
])

/**
 * Technologies détectées sur un service. Rattachée au référentiel `technologie` par la MÊME clé
 * que le parc matériel : le scan ne calcule aucune fin de vie, il alimente le référentiel et
 * toute la mécanique existante s'applique — statut de support, familles, enrichissement depuis
 * endoflife.date.
 */
export const serviceTechnologie = pgTable('service_technologie', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => serviceExpose.id, { onDelete: 'cascade' }),
  // Le produit tel que détecté, avant normalisation : « WordPress », « Apache ».
  produit: text('produit').notNull(),
  // La version telle qu'annoncée, quand elle l'est : « 6.4.2 ».
  version: text('version'),
  /**
   * La clé de rapprochement avec le référentiel, calculée par la même fonction que le parc.
   */
  technologieCle: text('technologie_cle'),
  technologieId: text('technologie_id').references(() => technologie.id, { onDelete: 'set null' }),
  certitude: detectionCertitude('certitude').notNull(),
  source: detectionSource('source').notNull(),
  detecteLe: timestamp('detecte_le').notNull().defaultNow(),
  ...timestamps(),
}, t => [
  uniqueIndex('service_technologie_unique').on(t.serviceId, t.produit),
  index('service_technologie_cle_idx').on(t.technologieCle),
])

/**
 * HISTORIQUE DES RELEVÉS — une ligne par passage, jamais réécrite. `service_technologie` est
 * ÉCRASÉE à chaque relevé : elle dit ce qui est, pas ce qui a changé.
 */
export type TechnologieReleve = { produit: string, version: string | null, certitude: string }
export type EnTetesReleve = { hsts: boolean, csp: boolean, xFrameOptions: boolean, referrerPolicy: boolean }
export type ScriptReleve = { url: string, externe: boolean, sha256: string }

export const releveActif = pgTable('releve_actif', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => serviceExpose.id, { onDelete: 'cascade' }),
  releveLe: timestamp('releve_le').notNull().defaultNow(),
  /** `ok` : la page a été lue. `echec` : rien de ce qui suit ne vaut constat d'absence. */
  statut: text('statut').notNull(),
  message: text('message'),
  codeHttp: integer('code_http'),
  technologies: jsonb('technologies').$type<TechnologieReleve[] | null>(),
  enTetes: jsonb('en_tetes').$type<EnTetesReleve | null>(),
  // Le certificat au moment du relevé. `null` partout : pas de relevé TLS (port en clair)
  // ou rien de lisible — la comparaison n'y verra pas un remplacement.
  certificatStatut: text('certificat_statut'),
  certificatEmpreinte: text('certificat_empreinte'),
  certificatDateFin: timestamp('certificat_date_fin'),
  /** Empreintes des scripts servis. `null` tant que le relevé ne les collecte pas. */
  scripts: jsonb('scripts').$type<ScriptReleve[] | null>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  index('releve_actif_service_date_idx').on(t.serviceId, t.releveLe),
  index('releve_actif_date_idx').on(t.releveLe),
])

/**
 * PAGES CIBLES — les pages qui comptent, pas seulement la racine. Relever `/` seul ne l'aurait
 * jamais vu.
 */
export const pageCibleNature = pgEnum('page_cible_nature', ['paiement', 'panier', 'connexion', 'donnees_personnelles', 'autre'])

export const pageCible = pgTable('page_cible', {
  id: id(),
  serviceId: text('service_id').notNull().references(() => serviceExpose.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  nature: pageCibleNature('nature').notNull().default('autre'),
  notes: text('notes'),
  dernierReleveLe: timestamp('dernier_releve_le'),
  /** En-tête CSP servi. `null` : jamais relevée ; `''` : relevée, en-tête absent. */
  csp: text('csp'),
  // La référence est VALIDÉE par une personne : sans elle, aucun écart ne peut être dit.
  referenceValideeLe: timestamp('reference_validee_le'),
  referenceValideePar: text('reference_validee_par'),
  ...timestamps(),
}, t => [
  uniqueIndex('page_cible_service_url_unique').on(t.serviceId, t.url),
])

/**
 * `reference` : l'inventaire validé. `observe` : le dernier relevé, remplacé à chaque passage.
 */
export const scriptRole = pgEnum('script_role', ['reference', 'observe'])

export const scriptPage = pgTable('script_page', {
  id: id(),
  pageId: text('page_id').notNull().references(() => pageCible.id, { onDelete: 'cascade' }),
  role: scriptRole('role').notNull(),
  /** `null` : script en ligne, identifié par son empreinte seule. */
  src: text('src'),
  domaine: text('domaine'),
  externe: boolean('externe').notNull(),
  sha256: text('sha256').notNull(),
  /** Attribut `integrity` (SRI) présent sur la balise. */
  integrity: boolean('integrity'),
  releveLe: timestamp('releve_le').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  index('script_page_page_role_idx').on(t.pageId, t.role),
])
