import { pgTable, pgEnum, text, boolean, integer, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { composanteType } from './organisation'

// CONNECTEUR LDAPS — lecture de l'annuaire de l'établissement. LECTURE SEULE, comme GLPI, Sniff
// et HarfangLab.

export const ldapSyncStatut = pgEnum('ldap_sync_statut', ['jamais', 'ok', 'erreur', 'en_cours'])

export const connecteurLdap = pgTable('connecteur_ldap', {
  id: id(),
  url: text('url'), // ex. ldaps://ldaps.example.org
  // DN du compte de service (ou=services). Lecture seule sur les attributs publics.
  bindDn: text('bind_dn'),
  // CHIFFRÉ en base, comme le jeton HarfangLab (voir utils/secrets.ts).
  motDePasse: text('mot_de_passe'),
  baseDn: text('base_dn').default('ou=people,dc=example,dc=org'),
  /**
   * FILTRE DE RECHERCHE — sur `eduPersonAffiliation`, et non sur `objectClass`.
   */
  filtre: text('filtre').default('(|(eduPersonAffiliation=employee)(eduPersonAffiliation=faculty)(eduPersonAffiliation=staff)(eduPersonAffiliation=teacher)(eduPersonAffiliation=researcher)(eduPersonAffiliation=emeritus)(eduPersonAffiliation=affiliate))'),
  actif: boolean('actif').notNull().default(false),
  frequenceHeures: integer('frequence_heures').notNull().default(24),
  dernierSyncAt: timestamp('dernier_sync_at'),
  dernierStatut: ldapSyncStatut('dernier_statut').notNull().default('jamais'),
  dernierMessage: text('dernier_message'),
  // { lues, creees, majs, desactivees, sansRattachement, aRapprocher }
  dernierComptes: jsonb('dernier_comptes'),
  ...timestamps(),
})

/**
 * À QUEL NIVEAU vit une unité d'organisation. `ignorer` n\'est pas un défaut de saisie : c\'est
 * une décision.
 */
export const uniteNature = pgEnum('unite_nature', [
  'composante',
  'service',
  'departement',
  'pole',
  'laboratoire',
  'ignorer',
])

export const uniteSource = pgEnum('unite_source', ['livree', 'manuelle'])

/**
 * CORRESPONDANCE DES UNITÉS — le seul endroit où GLPI et l'annuaire se rejoignent.
 */
export const correspondanceUnite = pgTable('correspondance_unite', {
  id: id(),
  /** Le code de l'annuaire : « 901 », « 6174 ». Nul quand l\'unité n\'en a pas. */
  code: text('code'),
  /** Le nom tel que GLPI l'écrit : « FEMTO-ST », « DEQ », « Dept-INFO ». */
  nomGlpi: text('nom_glpi'),
  /**
   * LE LIBELLÉ DE L'ANNUAIRE, troisième clé — indispensable au niveau service.
   */
  libelleLdap: text('libelle_ldap'),
  nature: uniteNature('nature').notNull(),
  /** Le type de composante, quand `nature` vaut `composante` ou `laboratoire`. */
  typeComposante: composanteType('type_composante'),
  /** L'INTITULÉ QUI FAIT FOI. Les libellés des sources sont périmés ou tronqués. */
  intitule: text('intitule').notNull(),
  sigle: text('sigle'),
  /** Le code de la composante de rattachement, pour un service ou un département. */
  composanteCode: text('composante_code'),
  source: uniteSource('source').notNull().default('manuelle'),
  /**
   * FUSION : cette ligne n'est qu\'une SECONDE ÉCRITURE d\'une autre. L\'annuaire porte les deux
   * formes pour la même unité — « UFR Sciences de la santé Département maieutique » et « UFR
   * Sciences de la santé maieutique ».
   */
  fusionneeAvec: text('fusionnee_avec').references((): AnyPgColumn => correspondanceUnite.id, { onDelete: 'set null' }),
  /** Une note libre : pourquoi `ignorer`, ou ce qui reste à vérifier. */
  note: text('note'),
  ...timestamps(),
}, t => [
  // Un code ne désigne qu'une unité. Deux lignes pour « 901 » rendraient le
  // rapprochement non déterministe, donc variable d'une synchronisation à l'autre.
  uniqueIndex('correspondance_unite_code_unique').on(t.code),
  uniqueIndex('correspondance_unite_glpi_unique').on(t.nomGlpi),
  uniqueIndex('correspondance_unite_ldap_unique').on(t.libelleLdap),
])

/**
 * CE QUE LES SOURCES CONTIENNENT RÉELLEMENT — la matière des listes déroulantes.
 */
export const valeurVue = pgEnum('valeur_vue_source', ['ldap_composante', 'ldap_labo', 'ldap_service', 'glpi_niveau2', 'glpi_niveau3', 'glpi_niveau4'])

export const uniteVue = pgTable('unite_vue', {
  id: id(),
  provenance: valeurVue('provenance').notNull(),
  /** La valeur BRUTE, telle que la source la rend. Jamais nettoyée ici. */
  valeur: text('valeur').notNull(),
  /** Le code extrait, quand il s'en extrait un. Nul sinon — jamais inventé. */
  code: text('code'),
  effectif: integer('effectif').notNull().default(0),
  /** La correspondance retenue, si elle existe. Nul = à rapprocher. */
  correspondanceId: text('correspondance_id').references((): AnyPgColumn => correspondanceUnite.id, { onDelete: 'set null' }),
  vuAuSync: boolean('vu_au_sync').notNull().default(true),
  ...timestamps(),
}, t => [
  uniqueIndex('unite_vue_unique').on(t.provenance, t.valeur),
  index('unite_vue_correspondance_idx').on(t.correspondanceId),
])
