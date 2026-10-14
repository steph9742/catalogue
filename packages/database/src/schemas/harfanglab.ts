import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// Connecteur HarfangLab (EDR) — LECTURE SEULE. Deux questions auxquelles rien ne répondait :
// quelles machines DEVRAIENT être surveillées et ne le sont pas, et est-ce qu'un moteur de
// détection s'est éteint.

export const harfanglabSyncStatut = pgEnum('harfanglab_sync_statut', ['jamais', 'ok', 'erreur', 'en_cours'])

export const connecteurHarfanglab = pgTable('connecteur_harfanglab', {
  id: id(),
  url: text('url'), // ex. https://edr.example.org (sans /api)
  // Jeton d'API, CHIFFRÉ en base (voir utils/secrets.ts). L'en-tête est « Authorization: Token
  // <jeton> » — format vérifié sur l'instance de l'établissement, car le swagger déclare le nom
  // de l'en-tête sans jamais donner le préfixe.
  jeton: text('jeton'),
  actif: boolean('actif').notNull().default(false),
  frequenceHeures: integer('frequence_heures').notNull().default(24),
  dernierSyncAt: timestamp('dernier_sync_at'),
  dernierStatut: harfanglabSyncStatut('dernier_statut').notNull().default('jamais'),
  dernierMessage: text('dernier_message'),
  dernierComptes: jsonb('dernier_comptes'),
  // MARQUEURS DES RÈGLES TECHNIQUES, déclarés ici et non codés en dur. Une règle dont une
  // étiquette figure dans cette liste est technique, donc sans échéance de revue.
  marqueursTechniques: jsonb('marqueurs_techniques').$type<string[]>(),
  ...timestamps(),
})

// --- Flotte d'agents : copie minimale -----------------------------------------------
// `agentId` est l'identifiant HarfangLab (uuid). Le reste sert soit au rapprochement (série,
// adresse matérielle, nom d'hôte), soit à l'écart (dernière remontée, état), soit à l'état des
// moteurs — que l'API livre DÉJÀ dans la liste des agents, puisque `Agent.policy` est la
// politique complète et non un…
export const harfanglabAgent = pgTable('harfanglab_agent', {
  id: id(),
  agentId: text('agent_id').notNull().unique(),
  hostname: text('hostname'),
  // Clés de rapprochement. Le nom d'hôte n'en est PAS une : l'inventaire compte 219
  // doublons de nom sur 8 859 machines, et certains agents renvoient « localhost ».
  machineSerial: text('machine_serial'),
  hardwareAddress: text('hardware_address'),
  // État de l'agent : online | offline | idle | access_denied (énumération de l'API,
  // stockée en texte : une valeur nouvelle ne doit pas casser la synchronisation).
  statut: text('statut'),
  lastseen: timestamp('lastseen'),
  version: text('version'),
  ostype: text('ostype'),
  politiqueId: text('politique_id'),
  politiqueNom: text('politique_nom'),
  /**
   * Texte libre côté HarfangLab : elle ne désigne une unité du Catalogue qu'à travers un
   * rapprochement exact ou la correspondance déclarée.
   */
  entiteEdr: text('entite_edr'),
  /** Les quatre `additional_info` bruts. Les autres clés sont remplies ; leur sens n'est pas encore relevé. */
  infosAdditionnelles: jsonb('infos_additionnelles'),
  // MODES DES MOTEURS, tels que l'API les rend : des entiers de 0 à 3. ⚠️ Leur SÉMANTIQUE n'est
  // écrite nulle part dans le swagger — ni `enum`, ni `description`.
  modes: jsonb('modes'),
  // Révisions effectivement chargées par l'agent (`effective_*_revision`). Un agent en
  // retard sur sa politique se repère par comparaison avec la révision de celle-ci.
  revisions: jsonb('revisions'),
  vuAuSync: boolean('vu_au_sync').notNull().default(true),
  ...timestamps(),
}, table => [
  index('harfanglab_agent_serial_idx').on(table.machineSerial),
  index('harfanglab_agent_hostname_idx').on(table.hostname),
])

// --- Instantané quotidien de l'état des moteurs, par politique ----------------------
// Conservé pour être COMPARÉ au précédent : c'est le changement qui intéresse, pas l'état
// isolé.
export const harfanglabMoteurSnapshot = pgTable('harfanglab_moteur_snapshot', {
  id: id(),
  politiqueId: text('politique_id').notNull(),
  politiqueNom: text('politique_nom'),
  releveLe: timestamp('releve_le').notNull().defaultNow(),
  modes: jsonb('modes'),
  revisions: jsonb('revisions'),
  // Écart constaté avec l'instantané précédent, en clair. Null au premier relevé —
  // ce qui se distingue d'un tableau vide, qui signifie « comparé, rien n'a changé ».
  changements: jsonb('changements'),
}, table => [
  index('harfanglab_moteur_politique_idx').on(table.politiqueId, table.releveLe),
])

// --- Contenu des moteurs de détection : règles et jeux de règles ---------------------
// Objectif : ANALYSER et CENTRALISER ce que l'EDR applique réellement. Contrairement aux listes
// blanches, ces objets n'ont ni durée de validité ni revue : une règle de détection n'est pas
// un angle mort qu'on ouvre pour un temps, c'est la couverture elle-même.
export const edrMoteur = pgEnum('edr_moteur', ['yara', 'sigma', 'ioc', 'correlation', 'driverblock'])

export const edrRuleset = pgTable('edr_ruleset', {
  id: id(),
  rulesetId: text('ruleset_id').notNull().unique(), // uuid HarfangLab
  moteur: edrMoteur('moteur').notNull(),
  nom: text('nom').notNull(),
  description: text('description'),
  actif: boolean('actif'),
  detectionPoste: boolean('detection_poste'),
  blocageAgent: boolean('blocage_agent'),
  quarantaineAgent: boolean('quarantaine_agent'),
  // Compteurs rendus par l'API : combien de règles alertent, bloquent, mettent en
  // quarantaine, sont désactivées. C'est le résumé le plus utile d'un jeu de règles.
  compteurs: jsonb('compteurs').$type<Record<string, number>>(),
  // Politiques auxquelles ce jeu est rattaché. Un jeu que rien n'utilise est du travail
  // qui ne protège personne : c'est précisément ce qu'on veut voir.
  politiques: jsonb('politiques').$type<{ id: string, nom: string | null }[]>(),
  dateCreation: timestamp('date_creation'),
  dateMaj: timestamp('date_maj'),
  vuAuSync: timestamp('vu_au_sync').notNull().defaultNow(),
  ...timestamps(),
}, t => [index('edr_ruleset_moteur_idx').on(t.moteur)])

export const edrRegle = pgTable('edr_regle', {
  id: id(),
  moteur: edrMoteur('moteur').notNull(),
  // Identifiant dans HarfangLab. Unique PAR MOTEUR et non globalement : rien ne garantit
  // qu'un uuid de règle Sigma ne puisse pas coexister avec un identifiant IOC.
  harfanglabId: text('harfanglab_id').notNull(),
  nom: text('nom'),
  description: text('description'),
  // Le CONTENU, tel que l'outil le porte : corps du fichier YARA, YAML Sigma, définition de
  // corrélation.
  contenu: text('contenu'),
  typeIndicateur: text('type_indicateur'), // IOC / driverblock : hash, chemin, domaine…
  valeur: text('valeur'),
  // États rendus par l'API, BRUTS. `state`, `global_state` et `effective_state` coexistent et
  // la doc ne dit pas lequel prime : les traduire en « active / inactive » serait inventer.
  actif: boolean('actif'),
  etat: text('etat'),
  etatEffectif: text('etat_effectif'),
  sourceId: text('source_id'),
  sourceNom: text('source_nom'),
  fourniParEditeur: boolean('fourni_par_editeur'),
  rulesets: jsonb('rulesets').$type<{ id: string, nom: string | null }[]>(),
  // Enregistrement complet renvoyé par l'API. Les schémas diffèrent d'un moteur à l'autre et
  // évoluent d'une version à l'autre : sans cette copie, un champ non prévu serait perdu sans
  // que personne ne le sache.
  brut: jsonb('brut'),
  dateCreation: timestamp('date_creation'),
  dateMaj: timestamp('date_maj'),
  vuAuSync: timestamp('vu_au_sync').notNull().defaultNow(),
  ...timestamps(),
}, t => [
  index('edr_regle_moteur_id_idx').on(t.moteur, t.harfanglabId),
  index('edr_regle_moteur_idx').on(t.moteur),
])

// --- Correspondance « entité EDR → unité du Catalogue » ---------------------------------
// DÉCLARÉE, sur le modèle de la correspondance LDAP. Le rapprochement automatique ne prend
// qu'une correspondance EXACTE et sans ambiguïté (« IUTNFC » → « IUT NFC ») ; ce qui reste — «
// STDeptEnsInfo », « utinam_end », un « SCD » présent dans plusieurs composantes — se déclare
// ici.
export const entiteEdrCible = pgEnum('entite_edr_cible', ['composante', 'service', 'departement', 'pole', 'etablissement'])

export const correspondanceEntiteEdr = pgTable('correspondance_entite_edr', {
  id: id(),
  /** La valeur exacte d'`additional_info1`, casse comprise. */
  valeur: text('valeur').notNull().unique(),
  cibleType: entiteEdrCible('cible_type').notNull(),
  // Sans clé étrangère : la cible est dans l'une des quatre tables. Une unité supprimée rend
  // la déclaration « cible disparue », signalée dans les réglages.
  cibleId: text('cible_id').notNull(),
  note: text('note'),
  declarePar: text('declare_par'),
  ...timestamps(),
})
