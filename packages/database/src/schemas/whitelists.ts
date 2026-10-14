import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// LISTES BLANCHES — l'inventaire des angles morts volontaires. Poser une liste blanche, c'est
// décider de ne plus voir quelque chose.

export const whitelistSource = pgEnum('whitelist_source', ['harfanglab', 'sniff', 'les_deux'])

// Comment le rapprochement entre les deux sources a été établi. Même discipline que
// pour les agents : une preuve et un indice ne se confondent pas.
export const whitelistCertitude = pgEnum('whitelist_certitude', ['certain', 'probable'])

export const whitelist = pgTable('whitelist', {
  id: id(),
  source: whitelistSource('source').notNull(),
  // Identifiants d'origine. L'un OU l'autre, ou les deux quand la règle a été rapprochée.
  harfanglabId: text('harfanglab_id'),
  sniffExclusionId: text('sniff_exclusion_id'),
  // La REVUE ISOLÉE de Sniff, pour une règle posée hors incident : elle porte l'échéance que le
  // Catalogue datait auparavant.
  sniffRevueId: text('sniff_revue_id'),
  // L'incident qui motive l'exclusion, côté Sniff. C'est ce lien qui donne son sens à la
  // règle — sans lui, une liste blanche n'est qu'un trou dans la détection.
  sniffIncidentId: text('sniff_incident_id'),
  certitudeRapprochement: whitelistCertitude('certitude_rapprochement'),

  // --- Contenu ------------------------------------------------------------------------
  libelle: text('libelle').notNull(),
  criteres: jsonb('criteres'),
  cible: text('cible'),
  regleSigma: text('regle_sigma'),
  regleCorrelation: text('regle_correlation'),
  // Pourquoi l'activité est légitime. Sniff l'impose ; HarfangLab ne le garantit pas (son
  // `comment` est nullable).
  motif: text('motif'),
  active: boolean('active').notNull().default(true),

  // --- Règle TECHNIQUE ----------------------------------------------------------------
  // Une exclusion posée à la suite d'un incident est une DÉROGATION : quelqu'un a décidé de ne
  // plus voir quelque chose, et cette décision doit être réexaminée.
  technique: boolean('technique').notNull().default(false),
  // FOURNIE PAR L'ÉDITEUR. Le critère qui fait réellement le tri, et il est meilleur que le tag
  // : `provided_by_hlab` est structuré, documenté par HarfangLab, et n'exige aucune convention
  // d'écriture à maintenir.
  fourniParEditeur: boolean('fourni_par_editeur').notNull().default(false),
  // La règle est-elle encore dans l'EDR. Une règle disparue n'est plus un angle mort : elle n'a
  // donc plus d'échéance.
  presente: boolean('presente').notNull().default(true),
  // Échéance PORTÉE PAR SNIFF, quand la règle est appariée à une exclusion. Elle prime
  // alors sur tout calcul local : la date naît là où naît la décision.
  echeanceSniff: timestamp('echeance_sniff'),
  // Étiquettes relevées sur la règle, telles quelles.
  tags: jsonb('tags').$type<string[]>(),
  // DANS QUEL CHAMP le marqueur a été trouvé. Le swagger HarfangLab ne documente aucun champ de
  // tag : cette colonne dit où il vit RÉELLEMENT, constaté à la première synchronisation, au
  // lieu de le laisser supposé.
  champTags: text('champ_tags'),

  // --- Validité -----------------------------------------------------------------------
  // `dateCreation` vient de la SOURCE (creation_date HarfangLab, createdAt Sniff), JAMAIS de la
  // date d'import : une règle posée il y a trois ans ne devient pas neuve parce qu'on vient de
  // la découvrir.
  dateCreation: timestamp('date_creation'),
  // Posée à chaque revue ou prolongation. L'échéance court alors à partir d'elle.
  dateRevision: timestamp('date_revision'),
  // Nombre de prolongations. Une règle prolongée cinq fois n'est plus une mesure
  // temporaire : le compteur le rend visible sans avoir à lire un journal.
  prolongations: integer('prolongations').notNull().default(0),
  // Échéance déclarée par l'outil lui-même, quand il en porte une (HarfangLab a un
  // `expiration_date`).
  dateExpirationOutil: timestamp('date_expiration_outil'),

  vueAuSync: boolean('vue_au_sync').notNull().default(true),
  notes: text('notes'),
  ...timestamps(),
}, table => [
  index('whitelist_harfanglab_idx').on(table.harfanglabId),
  index('whitelist_sniff_idx').on(table.sniffExclusionId),
  index('whitelist_creation_idx').on(table.dateCreation),
])
