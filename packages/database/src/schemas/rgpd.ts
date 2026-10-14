import { boolean, date, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { application } from './applications'
import { personne } from './organisation'

// EXIGENCES DE SÉCURITÉ DU RGPD — règlement (UE) 2016/679. PÉRIMÈTRE VOLONTAIREMENT RESTREINT à
// la sécurité du traitement.

export const rgpdConformite = pgEnum('rgpd_conformite', [
  'conforme',
  'partielle',
  'non_conforme',
  'non_applicable',
])

export const rgpdStatut = pgEnum('rgpd_statut', ['a_faire', 'en_cours', 'fait'])

// PORTÉE — à quel niveau l'exigence se vérifie. La distinction n'est pas cosmétique : elle
// décide de ce qu'on demande, et à qui.
export const rgpdPortee = pgEnum('rgpd_portee', ['etablissement', 'application', 'les_deux'])

export const exigenceRgpd = pgTable('exigence_rgpd', {
  id: id(),
  // « 32.1.a », « 33.1 »… Numérotation du règlement, pour être citable dans un dossier.
  reference: text('reference').notNull().unique(),
  article: integer('article').notNull(),
  // Intitulé officiel de l'article (« Sécurité du traitement »).
  intituleArticle: text('intitule_article').notNull(),
  // Ce que l'exigence demande, en propre.
  intitule: text('intitule').notNull(),
  portee: rgpdPortee('portee').notNull().default('etablissement'),
  // Citation du texte, quand elle éclaire la lecture.
  extraitTexte: text('extrait_texte'),
  // --- Suivi de la mise en conformité, calqué sur NIS 2 -------------------------------
  conformite: rgpdConformite('conformite'),
  plan: text('plan'),
  echeance: date('echeance'),
  statut: rgpdStatut('statut').notNull().default('a_faire'),
  preuve: text('preuve'),
  responsableId: text('responsable_id').references(() => personne.id, { onDelete: 'set null' }),
  notes: text('notes'),
  ordre: integer('ordre').notNull().default(0),
  ...timestamps(),
})

// Cadre visé par un rapprochement : NIS 2 / ReCyF, ou une norme ISO.
export const rgpdCible = pgEnum('rgpd_cible', ['nis2', 'iso27001', 'iso27002'])

// CORRESPONDANCE RGPD ↔ NIS 2 / ISO — À LA DIFFÉRENCE DE ReCyF ↔ ISO, ELLE N'EST PAS
// OFFICIELLE.
export const exigenceRgpdLien = pgTable(
  'exigence_rgpd_lien',
  {
    id: id(),
    exigenceRgpdId: text('exigence_rgpd_id')
      .notNull()
      .references(() => exigenceRgpd.id, { onDelete: 'cascade' }),
    cible: rgpdCible('cible').notNull(),
    // Référence dans le cadre visé : « 1.1-EI/EE » pour ReCyF, « A.5.9 » pour l'annexe A.
    reference: text('reference').notNull(),
    intitule: text('intitule'),
    // Faux tant qu'aucune autorité ne publie ce rapprochement — c'est-à-dire toujours,
    // en l'état. Le champ existe pour le jour où l'une le ferait.
    officiel: boolean('officiel').notNull().default(false),
    // Pourquoi ce rapprochement : c'est lui qui rend la proposition discutable, donc
    // relisible. Un lien sans justification ne se vérifie pas.
    justification: text('justification'),
    valideLe: date('valide_le'),
    ...timestamps(),
  },
  t => [uniqueIndex('exigence_rgpd_lien_unique').on(t.exigenceRgpdId, t.cible, t.reference)],
)

// ─── NIVEAU APPLICATION ──────────────────────────────────────────────────────────────── Les
// exigences de portée `application` se vérifient traitement par traitement.

// Motifs déclenchant une analyse d'impact : les trois cas de l'article 35.3, complétés par les
// critères du CEPD et la liste publiée par la CNIL.
export const aipdMotif = pgEnum('aipd_motif', [
  'evaluation_scoring',
  'decision_automatisee',
  'surveillance_systematique',
  'donnees_sensibles',
  'grande_echelle',
  'croisement_donnees',
  'personnes_vulnerables',
  'usage_innovant',
  'liste_cnil',
  'autre',
])

// STATUT de l'analyse — distinct de sa conclusion. Les deux étaient confondus dans une première
// version : « en cours » y figurait comme conclusion.
export const aipdStatut = pgEnum('aipd_statut', ['non_requise', 'a_faire', 'en_cours', 'terminee'])

// Conclusion — n'a de sens qu'une fois l'analyse TERMINÉE. `risque_eleve_consultation` n'est
// pas une valeur comme les autres : l'article 36 impose de consulter l'autorité de contrôle
// AVANT de mettre en œuvre le traitement lorsque le risque résiduel reste élevé.
export const aipdConclusion = pgEnum('aipd_conclusion', [
  'risque_acceptable',
  'acceptable_sous_reserve',
  'risque_eleve_consultation',
  'traitement_modifie',
])

export const applicationRgpd = pgTable('application_rgpd', {
  id: id(),
  applicationId: text('application_id')
    .notNull()
    .unique()
    .references(() => application.id, { onDelete: 'cascade' }),
  // --- Analyse d'impact (art. 35) ---
  aipdStatut: aipdStatut('aipd_statut').notNull().default('non_requise'),
  aipdMotif: aipdMotif('aipd_motif'),
  // Obligatoire quand le motif vaut `autre` : un motif « autre » sans explication ne
  // justifie rien et ne se relit pas.
  aipdMotifPrecision: text('aipd_motif_precision'),
  aipdConclusion: aipdConclusion('aipd_conclusion'),
  aipdConclusionDetail: text('aipd_conclusion_detail'),
  aipdDate: date('aipd_date'),
  // Article 35.11 : réexaminer au moins lorsque le risque change. Sans échéance suivie, ce
  // réexamen n'a jamais lieu — c'est pourquoi cette date alimente le moteur d'échéances, au
  // même titre qu'une revue d'homologation.
  aipdRevueDate: date('aipd_revue_date'),
  notes: text('notes'),
  ...timestamps(),
})

// État d'une exigence RGPD POUR UNE APPLICATION donnée. TROIS ÉTATS, ET L'ABSENCE DE LIGNE EN
// VAUT UN QUATRIÈME.
export const etatExigenceApplication = pgEnum('etat_exigence_application', [
  'conforme',
  'non_conforme',
  'non_applicable',
])

export const applicationExigenceRgpd = pgTable(
  'application_exigence_rgpd',
  {
    id: id(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    exigenceRgpdId: text('exigence_rgpd_id')
      .notNull()
      .references(() => exigenceRgpd.id, { onDelete: 'cascade' }),
    etat: etatExigenceApplication('etat').notNull(),
    // Pourquoi cet état. Indispensable sur `non_applicable` : écarter une exigence sans
    // motif est la façon la plus simple d'être conforme sur le papier.
    justification: text('justification'),
    ...timestamps(),
  },
  t => [uniqueIndex('application_exigence_rgpd_unique').on(t.applicationId, t.exigenceRgpdId)],
)
