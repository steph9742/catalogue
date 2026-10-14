import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { couvertureDetection, id, timestamps } from './_shared'
import { appCriticite, application, dureeIndisponibiliteTolerable } from './applications'
import { lieu } from './lieux'
import { composante, departement, personne, service } from './organisation'

export const technoCategorie = pgEnum('techno_categorie', [
  'langage',
  'framework',
  'runtime',
  'base_de_donnees',
  'serveur_web',
  'conteneurisation',
  'orchestration',
  'os',
  'autre',
])
export const serveurType = pgEnum('serveur_type', ['vm', 'physique'])
export const hyperviseur = pgEnum('hyperviseur', ['vmware', 'proxmox'])
export const environnement = pgEnum('environnement', [
  'production',
  'preproduction',
  'recette',
  'developpement',
])
export const serveurStatut = pgEnum('serveur_statut', [
  'actif',
  'arrete',
  'decommissionne',
])
export const deploiementRole = pgEnum('deploiement_role', [
  'frontal_web',
  'applicatif',
  'base_de_donnees',
  'reverse_proxy',
  'cache',
  'batch',
  'autre',
])

// Inventaire techno versionné (PHP 8.2, PostgreSQL 15, Docker…), relié aux apps (pile
// logicielle) ET aux serveurs (runtime installé) — pour le suivi fin de vie.
export const sourceEolType = pgEnum('source_eol_type', ['manuel', 'api', 'interne'])

export const technologie = pgTable(
  'technologie',
  {
    id: id(),
    nom: text('nom').notNull(),
    version: text('version'),
    categorie: technoCategorie('categorie'),
    categoriePrecision: text('categorie_precision'),
    // Fin du support STANDARD de l'éditeur.
    finDeVie: date('fin_de_vie'),
    /**
     * DEUX RETARDS, DEUX DÉCISIONS — et les confondre donne un chiffre inactionnable.
     */
    derniereVersionBranche: text('derniere_version_branche'),
    derniereVersionGenerale: text('derniere_version_generale'),
    /** L'`eol` de ce cycle est-il futur ? `null` = non déterminé, jamais « oui ». */
    brancheMaintenue: boolean('branche_maintenue'),
    /** Fraîcheur du relevé : une version de référence ancienne se cite avec sa date. */
    derniereVersionReleveeLe: timestamp('derniere_version_relevee_le'),
    // Fin du support ÉTENDU quand il existe et qu'on y a souscrit (ESU Windows, ESM Ubuntu,
    // support prolongé Red Hat…).
    finDeVieEtendue: date('fin_de_vie_etendue'),
    // D'où vient la date : saisie humaine, source publique, ou table interne de secours.
    // Sert à ne jamais écraser une décision humaine lors d'une actualisation.
    sourceEol: sourceEolType('source_eol'),
    lienDoc: text('lien_doc'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('technologie_nom_version_unique').on(t.nom, t.version)],
)

export const serveur = pgTable('serveur', {
  id: id(),
  hostname: text('hostname').notNull().unique(),
  type: serveurType('type').notNull(),
  hyperviseur: hyperviseur('hyperviseur'),
  clusterVirt: text('cluster_virt'),
  localisation: text('localisation'),
  lieuId: text('lieu_id').references(() => lieu.id, { onDelete: 'set null' }),
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  os: text('os'),
  osVersion: text('os_version'),
  // CLÉ DE RAPPROCHEMENT AVEC LE RÉFÉRENTIEL DE FIN DE VIE, matérialisée. Le couple (os,
  // osVersion) ne suffit pas à retrouver une technologie : « Windows 11 » ne dit rien du
  // support, c'est la release qui le détermine — 22H2 n'est plus suivie depuis octobre 2024
  // quand 24H2 l'est jusqu'en 2026.
  technologieCle: text('technologie_cle'),
  cpu: integer('cpu'),
  ramGo: integer('ram_go'),
  disqueGo: integer('disque_go'),
  ip: text('ip'),
  vlan: text('vlan'),
  environnement: environnement('environnement'),
  // --- Cartographie NIS 2 : criticité, tolérance à l'interruption, responsable métier ---
  // Les mêmes trois champs que sur l'application : sans eux, l'annexe E ne se calcule pas
  // pour l'infrastructure, seulement pour les applications qu'elle porte.
  criticite: appCriticite('criticite'),
  dureeIndisponibiliteTolerable: dureeIndisponibiliteTolerable('duree_indisponibilite_tolerable'),
  responsableMetierId: text('responsable_metier_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  // Moyens de surveillance couvrant ce serveur (cumulables). Voir _shared.ts.
  couvertureDetection: couvertureDetection('couverture_detection').array(),
  hauteDispo: boolean('haute_dispo').default(false).notNull(),
  clusterNom: text('cluster_nom'),
  statut: serveurStatut('statut').notNull().default('actif'),
  dateDernierPatch: date('date_dernier_patch'),
  sourceGlpi: boolean('source_glpi').notNull().default(false),
  ...timestamps(),
})

// Lien application ⇄ serveur : porte le rôle (dont base_de_donnees) et l'environnement.
export const deploiement = pgTable(
  'deploiement',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    serveurId: text('serveur_id')
      .notNull()
      .references(() => serveur.id, { onDelete: 'cascade' }),
    role: deploiementRole('role').notNull(),
    rolePrecision: text('role_precision'),
    environnement: environnement('environnement'),
    notes: text('notes'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('deploiement_unique').on(t.applicationId, t.serveurId, t.role),
  ],
)

export const applicationTechnologie = pgTable(
  'application_technologie',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    technologieId: text('technologie_id')
      .notNull()
      .references(() => technologie.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('application_technologie_unique').on(
      t.applicationId,
      t.technologieId,
    ),
  ],
)

export const serveurTechnologie = pgTable(
  'serveur_technologie',
  {
    id: id(),
    serveurId: text('serveur_id')
      .notNull()
      .references(() => serveur.id, { onDelete: 'cascade' }),
    technologieId: text('technologie_id')
      .notNull()
      .references(() => technologie.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('serveur_technologie_unique').on(t.serveurId, t.technologieId),
  ],
)
