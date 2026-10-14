import { pgTable, pgEnum, text, boolean, integer, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { population } from './profils'
import { sectionCnu } from './academique'

// Hiérarchie d'organisation : Entité → Composante → { Département, Service → Pôle }.

// --- Enums ---
export const entiteStatutJuridique = pgEnum('entite_statut_juridique', [
  'epscp', // Établissement public à caractère scientifique, culturel et professionnel
  'epa',
  'epic',
  'gip',
  'association',
  'autre',
])

// Composantes au sens de l'article L713-1 du code de l'éducation.
export const composanteType = pgEnum('composante_type', [
  'ufr',
  'institut',
  'ecole_ingenieur',
  'ecole_interne',
  'ecole_doctorale',
  'service_commun',
  'laboratoire',
  'autre',
])

export const departementType = pgEnum('departement_type', ['recherche', 'enseignement'])

// Un titre porté par une personne est soit un « référent de … », soit un rôle/mission
// (RSSI adjoint, DPO, chargé de mission…).
export const personneTitreKind = pgEnum('personne_titre_kind', ['referent', 'mission'])

// Gouvernance d'une entité (établissement). Certains rôles sont multiples (VP, DGA).
export const entiteRoleType = pgEnum('entite_role_type', [
  'president',
  'vice_president',
  'chef_cabinet',
  'secretaire_cabinet',
  'dgs',
  'dga',
])

// Type de pôle : IT (avec domaine précis) ou Autre (domaine en texte libre).
export const poleType = pgEnum('pole_type', ['it', 'autre'])
export const poleDomaineIt = pgEnum('pole_domaine_it', [
  'metiers',
  'dev',
  'systemes',
  'reseaux',
  'cyber',
  'mesocentre',
  'support',
  'autre',
])

// --- Tables ---

// Agents internes DSI/univ, référencés comme directeur / RSA / secrétaire / responsable.
export const personne = pgTable('personne', {
  id: id(),
  nom: text('nom').notNull(),
  prenom: text('prenom'),
  description: text('description'),
  email: text('email'),
  telephone: text('telephone'),
  fonction: text('fonction'),
  // Population (statut) de la personne : enseignant-chercheur, BIATSS, étudiant…
  populationId: text('population_id').references(() => population.id, { onDelete: 'set null' }),
  // Section CNU (discipline) — pour les enseignants-chercheurs.
  sectionCnuId: text('section_cnu_id').references(() => sectionCnu.id, { onDelete: 'set null' }),
  // Rattachement organisationnel : composante (→ entité) + éventuellement service /
  // pôle / département.
  composanteId: text('composante_id').references((): AnyPgColumn => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references((): AnyPgColumn => service.id, { onDelete: 'set null' }),
  poleId: text('pole_id').references((): AnyPgColumn => pole.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references((): AnyPgColumn => departement.id, { onDelete: 'set null' }),
  actif: boolean('actif').default(true).notNull(),
  /**
   * L'identifiant de l\'annuaire. LA clé de rapprochement du connecteur LDAP.
   */
  uidLdap: text('uid_ldap').unique(),
  /** La fiche vient de l'annuaire, par opposition à une saisie manuelle. */
  sourceLdap: boolean('source_ldap').default(false).notNull(),
  /**
   * Le préfixe brut de `supannEntiteAffectation` : `cmpi`, `cmpa`, `cmpg`.
   */
  prefixeAffectation: text('prefixe_affectation'),
  /**
   * L'authentification à plusieurs facteurs est activée. Déduit de la PRÉSENCE de
   * `ufcMailPersoMFA` dans l'annuaire, jamais de son contenu : c\'est le fait qui intéresse la
   * cyber, pas l'adresse personnelle de recours.
   */
  mfaActif: boolean('mfa_actif'),
  ...timestamps(),
})

// Titres portés par une personne : référent d'un sujet (RGPD, Moodle…) OU rôle/mission (RSSI
// adjoint, DPO…), distingués par `kind`.
export const personneReferent = pgTable('personne_referent', {
  id: id(),
  personneId: text('personne_id').notNull().references((): AnyPgColumn => personne.id, { onDelete: 'cascade' }),
  titre: text('titre').notNull(),
  kind: personneTitreKind('kind').notNull().default('referent'),
  ...timestamps(),
}, t => [uniqueIndex('personne_referent_unique').on(t.personneId, t.titre, t.kind)])

// Établissement racine (l'université).
export const entite = pgTable('entite', {
  id: id(),
  nom: text('nom').notNull(),
  sigle: text('sigle'),
  description: text('description'),
  statutJuridique: entiteStatutJuridique('statut_juridique'),
  effectif: integer('effectif'),
  siteWeb: text('site_web'),
  actif: boolean('actif').default(true).notNull(),
  ...timestamps(),
})

// Composante d'une entité (UFR, institut, école, labo…). Centrale ou non.
export const composante = pgTable('composante', {
  id: id(),
  nom: text('nom').notNull(),
  sigle: text('sigle'),
  description: text('description'),
  entiteId: text('entite_id').notNull().references((): AnyPgColumn => entite.id, { onDelete: 'cascade' }),
  type: composanteType('type').notNull(),
  centrale: boolean('centrale').default(false).notNull(),
  effectif: integer('effectif'),
  siteWeb: text('site_web'),
  directeurId: text('directeur_id').references((): AnyPgColumn => personne.id, { onDelete: 'set null' }),
  viceDirecteurId: text('vice_directeur_id').references((): AnyPgColumn => personne.id, { onDelete: 'set null' }),
  rsaId: text('rsa_id').references((): AnyPgColumn => personne.id, { onDelete: 'set null' }),
  // Créée automatiquement depuis l'arborescence d'entités GLPI (à qualifier ensuite).
  sourceGlpi: boolean('source_glpi').default(false).notNull(),
  /**
   * Le code d'unité de recherche : « 6174 », « EA4267 ». Pour les laboratoires.
   */
  codeUnite: text('code_unite'),
  /**
   * Créée par le connecteur sans correspondance connue. Reste dans la file « à rapprocher »
   * tant que personne n'a tranché — une création silencieuse produirait « Utinam » et «
   * Univers, théorie… » côte à côte, deux composantes pour un laboratoire.
   */
  aRapprocher: boolean('a_rapprocher').default(false).notNull(),
  actif: boolean('actif').default(true).notNull(),
  ...timestamps(),
})

// Département (recherche ou enseignement) d'une composante.
export const departement = pgTable('departement', {
  id: id(),
  nom: text('nom').notNull(),
  description: text('description'),
  composanteId: text('composante_id').notNull().references((): AnyPgColumn => composante.id, { onDelete: 'cascade' }),
  type: departementType('type').notNull(),
  effectif: integer('effectif'),
  siteWeb: text('site_web'),
  directeurId: text('directeur_id').references((): AnyPgColumn => personne.id, { onDelete: 'set null' }),
  secretaireId: text('secretaire_id').references((): AnyPgColumn => personne.id, { onDelete: 'set null' }),
  // Créé automatiquement depuis le 3e niveau de l'entité GLPI (« Dept-INFO »…).
  sourceGlpi: boolean('source_glpi').default(false).notNull(),
  actif: boolean('actif').default(true).notNull(),
  ...timestamps(),
})

// Service (administratif/technique) d'une composante. Peut être central.
export const service = pgTable('service', {
  id: id(),
  nom: text('nom').notNull(),
  description: text('description'),
  composanteId: text('composante_id').notNull().references((): AnyPgColumn => composante.id, { onDelete: 'cascade' }),
  central: boolean('central').default(false).notNull(),
  raisonEtre: text('raison_etre'), // mission (ex. Dnum = informatique)
  // Créé automatiquement depuis le 3e niveau de l'entité GLPI (souvent un service ou un
  // département : l'utilisateur requalifie si besoin).
  sourceGlpi: boolean('source_glpi').default(false).notNull(),
  effectif: integer('effectif'),
  siteWeb: text('site_web'),
  directeurId: text('directeur_id').references((): AnyPgColumn => personne.id, { onDelete: 'set null' }),
  actif: boolean('actif').default(true).notNull(),
  ...timestamps(),
})

// Pôle d'un service. Type IT (domaine dans une liste) ou Autre (domaine libre).
export const pole = pgTable('pole', {
  id: id(),
  nom: text('nom').notNull(),
  description: text('description'),
  serviceId: text('service_id').notNull().references((): AnyPgColumn => service.id, { onDelete: 'cascade' }),
  type: poleType('type').notNull(),
  domaineIt: poleDomaineIt('domaine_it'),
  domaine: text('domaine'), // précision libre : domaine IT « autre », ou type « autre »
  raisonEtre: text('raison_etre'), // rôle précis dans le service
  effectif: integer('effectif'),
  responsableId: text('responsable_id').references((): AnyPgColumn => personne.id, { onDelete: 'set null' }),
  actif: boolean('actif').default(true).notNull(),
  // Marqué pour être requalifié sans être confondu avec une saisie manuelle.
  sourceGlpi: boolean('source_glpi').default(false).notNull(),
  ...timestamps(),
})

// Membres de la gouvernance d'une entité (président, VP, DGS, DGA, cabinet…).
export const entiteResponsable = pgTable('entite_responsable', {
  id: id(),
  entiteId: text('entite_id').notNull().references(() => entite.id, { onDelete: 'cascade' }),
  personneId: text('personne_id').notNull().references(() => personne.id, { onDelete: 'cascade' }),
  role: entiteRoleType('role').notNull(),
  ordre: integer('ordre'),
  ...timestamps(),
}, t => [uniqueIndex('entite_responsable_unique').on(t.entiteId, t.personneId, t.role)])


// Référents cyber d'une composante. Table de liaison (et non deux colonnes) parce que le
// premier rôle est multiple.
export const composanteReferentRole = pgEnum('composante_referent_role', [
  'informaticien_proximite',
  'cssi',
])

export const composanteReferent = pgTable(
  'composante_referent',
  {
    id: id(),
    composanteId: text('composante_id')
      .notNull()
      .references((): AnyPgColumn => composante.id, { onDelete: 'cascade' }),
    personneId: text('personne_id')
      .notNull()
      .references((): AnyPgColumn => personne.id, { onDelete: 'cascade' }),
    role: composanteReferentRole('role').notNull(),
    ...timestamps(),
  },
  t => [uniqueIndex('composante_referent_unique').on(t.composanteId, t.personneId, t.role)],
)
