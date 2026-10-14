import { Elysia, t } from 'elysia'
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { db } from '@catalogue/database'
import {
  application, applicationRgpd, actionNis2, clauseIso27001, exigenceNis2, exigenceNis2Mesure,
  exigenceNis2Iso, exigenceNis2Responsable, exigenceRgpd, mesureSmsi, nonConformite, objectifNis2, personne,
  risqueSmsi, actifSmsi,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'
import { expressionEtatRgpd } from './rgpd'
import { auditSmsi, revueDirection } from '@catalogue/database/tables'
import { partitionAvecNul } from '../utils/partition'
import { aipdStatut, iso27001Conformite, nis2Conformite, nis2Statut, rgpdConformite } from '@catalogue/database/tables'

// CONFORMITÉ — les questions d'ÉTAT, pour un appelant qui n'a pas d'écran.

// LES TROIS CADRES N'EMPLOIENT PAS LE MÊME VOCABULAIRE, et c'est le piège de ce routeur.
const CONFORME = { nis2: 'fait', iso27001: 'conforme', rgpd: 'conforme' } as const

// Ce qui n'est PAS un écart : conforme, ou explicitement déclaré hors périmètre.
const HORS_ECART = {
  nis2: ['fait'],
  iso27001: ['conforme', 'non_applicable'],
  rgpd: ['conforme', 'non_applicable'],
} as const

// La liste est une CONSTANTE interne, jamais une entrée utilisateur : la rendre en littéraux
// SQL est sans risque, et évite de faire passer un tableau JS pour un tableau Postgres — ce que
// Drizzle transforme en paramètre lié, que Postgres refuse.
const pasParmi = (colonne: AnyPgColumn, valeurs: readonly string[]) =>
  sql`${colonne}::text not in (${sql.join(valeurs.map(v => sql`${v}`), sql`, `)})`

type LigneEcart = {
  cadre: string
  categorie: string
  id: string
  reference: string | null
  intitule: string
  conformite: string | null
  statut: string | null
  plan: string | null
  echeance: string | null
  preuve: string | null
  responsable: string | null
  url: string
  urlAbsolue: string
  majLe: string | null
}

const TRI_ECARTS = 'cadre, puis référence'

export const conformiteRouter = new Elysia({ name: 'conformite', prefix: '/api/conformite' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Conformité'] } })

  /**
   * LES ÉCARTS : tout ce qui n'est pas conforme, dans les trois cadres, sous une forme unique.
   */
  .get('/ecarts', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    const cadre = query.cadre ?? 'tous'
    const veut = (c: string) => cadre === 'tous' || cadre === c
    const lignes: LigneEcart[] = []

    // `nonEvaluees=false` retire les exigences jamais évaluées. Elles sont INCLUSES par
    // défaut : une exigence qu'on n'a jamais regardée n'est pas une exigence conforme.
    const inclureNonEvaluees = query.nonEvaluees !== 'false'

    if (veut('nis2') && cats.has('exigences-nis2')) {
      const rows = await db.select({
        id: exigenceNis2.id, reference: exigenceNis2.reference, intitule: exigenceNis2.intitule,
        conformite: exigenceNis2.conformite, statut: exigenceNis2.statut, plan: exigenceNis2.plan,
        echeance: exigenceNis2.echeance, preuve: exigenceNis2.preuve,
        objectif: objectifNis2.intitule, numero: objectifNis2.numero,
        majLe: sql<string | null>`cast(${exigenceNis2}."updated_at" as text)`,
      })
        .from(exigenceNis2)
        .leftJoin(objectifNis2, eq(objectifNis2.id, exigenceNis2.objectifNis2Id))
        .where(and(
          // Une exigence déclarée non applicable n'est pas un écart : c'est une décision.
          sql`${exigenceNis2.statut}::text is distinct from 'non_applicable'`,
          inclureNonEvaluees
            ? or(isNull(exigenceNis2.conformite), pasParmi(exigenceNis2.conformite, HORS_ECART.nis2))
            : and(sql`${exigenceNis2.conformite} is not null`, pasParmi(exigenceNis2.conformite, HORS_ECART.nis2)),
        ))
        .orderBy(asc(objectifNis2.numero), asc(exigenceNis2.reference))
      for (const r of rows) {
        lignes.push({
          cadre: 'nis2', categorie: 'exigences-nis2', id: r.id, reference: r.reference,
          intitule: `${r.numero ? `[${r.numero}] ` : ''}${r.intitule}`,
          conformite: r.conformite, statut: r.statut, plan: r.plan,
          echeance: r.echeance ? String(r.echeance) : null, preuve: r.preuve,
          // NIS 2 range les responsables dans une table de liaison propre : les joindre
          // ici en donnerait un seul, arbitrairement. Mieux vaut null qu'un nom faux.
          responsable: null,
          url: `/exigences-nis2/${r.id}`, urlAbsolue: urlPublique(`/exigences-nis2/${r.id}`),
          majLe: r.majLe,
        })
      }
    }

    if (veut('iso27001') && cats.has('clauses-iso27001')) {
      const rows = await db.select({
        id: clauseIso27001.id, reference: clauseIso27001.reference, intitule: clauseIso27001.intitule,
        conformite: clauseIso27001.conformite, statut: clauseIso27001.statut, plan: clauseIso27001.plan,
        echeance: clauseIso27001.echeance, preuve: clauseIso27001.preuve,
        responsable: personne.nom,
        majLe: sql<string | null>`cast(${clauseIso27001}."updated_at" as text)`,
      })
        .from(clauseIso27001)
        .leftJoin(personne, eq(personne.id, clauseIso27001.responsableId))
        .where(inclureNonEvaluees
          ? or(isNull(clauseIso27001.conformite), pasParmi(clauseIso27001.conformite, HORS_ECART.iso27001))
          : and(sql`${clauseIso27001.conformite} is not null`, pasParmi(clauseIso27001.conformite, HORS_ECART.iso27001)))
        .orderBy(asc(clauseIso27001.ordre), asc(clauseIso27001.reference))
      for (const r of rows) {
        lignes.push({
          cadre: 'iso27001', categorie: 'clauses-iso27001', id: r.id, reference: r.reference,
          intitule: r.intitule, conformite: r.conformite, statut: r.statut, plan: r.plan,
          echeance: r.echeance ? String(r.echeance) : null, preuve: r.preuve,
          responsable: r.responsable,
          url: `/clauses-iso27001/${r.id}`, urlAbsolue: urlPublique(`/clauses-iso27001/${r.id}`),
          majLe: r.majLe,
        })
      }
    }

    if (veut('rgpd') && cats.has('exigences-rgpd')) {
      const rows = await db.select({
        id: exigenceRgpd.id, reference: exigenceRgpd.reference, intitule: exigenceRgpd.intitule,
        article: exigenceRgpd.article, portee: exigenceRgpd.portee,
        conformite: exigenceRgpd.conformite, statut: exigenceRgpd.statut, plan: exigenceRgpd.plan,
        echeance: exigenceRgpd.echeance, preuve: exigenceRgpd.preuve,
        responsable: personne.nom,
        majLe: sql<string | null>`cast(${exigenceRgpd}."updated_at" as text)`,
      })
        .from(exigenceRgpd)
        .leftJoin(personne, eq(personne.id, exigenceRgpd.responsableId))
        .where(inclureNonEvaluees
          ? or(isNull(exigenceRgpd.conformite), pasParmi(exigenceRgpd.conformite, HORS_ECART.rgpd))
          : and(sql`${exigenceRgpd.conformite} is not null`, pasParmi(exigenceRgpd.conformite, HORS_ECART.rgpd)))
        .orderBy(asc(exigenceRgpd.ordre))
      for (const r of rows) {
        lignes.push({
          cadre: 'rgpd', categorie: 'exigences-rgpd', id: r.id, reference: r.reference,
          intitule: `${r.article ? `art. ${r.article} — ` : ''}${r.intitule}`,
          conformite: r.conformite, statut: r.statut, plan: r.plan,
          echeance: r.echeance ? String(r.echeance) : null, preuve: r.preuve,
          responsable: r.responsable,
          url: '/rgpd', urlAbsolue: urlPublique('/rgpd'),
          majLe: r.majLe,
        })
      }
    }

    const sansPlan = query.sansPlan === 'true'
      ? lignes.filter(l => !l.plan?.trim())
      : lignes

    return {
      total: sansPlan.length,
      tri: TRI_ECARTS,
      // Un cadre absent parce que l'appelant n'a pas le droit de le lire n'est PAS un
      // cadre sans écart. Le dire évite qu'une réponse partielle passe pour complète.
      cadresLus: ['nis2', 'iso27001', 'rgpd'].filter(c => veut(c) && cats.has(
        c === 'nis2' ? 'exigences-nis2' : c === 'iso27001' ? 'clauses-iso27001' : 'exigences-rgpd',
      )),
      resultats: sansPlan,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({
      cadre: t.Optional(t.String()),
      sansPlan: t.Optional(t.String()),
      nonEvaluees: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Les écarts de conformité : tout ce qui n\'est pas « fait », dans les trois cadres.',
      description: 'Filtres : `cadre` (nis2 | iso27001 | rgpd | tous), `sansPlan=true` pour ne garder que '
        + 'les écarts SANS plan d\'action écrit, `nonEvaluees=false` pour exclure ce qui n\'a jamais été '
        + 'évalué. Les non évaluées sont INCLUSES par défaut : une exigence qu\'on n\'a jamais regardée '
        + 'n\'est pas une exigence conforme. Les exigences NIS 2 déclarées non applicables sont exclues — '
        + 'c\'est une décision, pas un écart. `cadresLus` dit quels cadres l\'appelant a pu lire : un cadre '
        + 'absent faute de droits n\'est pas un cadre sans écart. Tri : cadre, puis référence.',
    },
  })

  /**
   * LE PLAN D'ACTIONS : ce qui est engagé, par qui, pour quand. Deux sources, parce que les
   * deux cadres travaillent différemment — actions NIS 2 rattachées à une exigence, et
   * non-conformités ISO qui portent leur propre correction.
   */
  .get('/plan', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    const cadre = query.cadre ?? 'tous'
    const veut = (c: string) => cadre === 'tous' || cadre === c
    const resultats: Record<string, unknown>[] = []

    if (veut('nis2') && cats.has('actions-nis2')) {
      const rows = await db.select({
        id: actionNis2.id, intitule: actionNis2.intitule, description: actionNis2.description,
        statut: actionNis2.statut, priorite: actionNis2.priorite, echeance: actionNis2.echeance,
        dateFait: actionNis2.dateFait, preuve: actionNis2.preuve,
        responsable: personne.nom,
        exigence: exigenceNis2.intitule, reference: exigenceNis2.reference,
        objectif: objectifNis2.intitule, objectifNumero: objectifNis2.numero,
        majLe: sql<string | null>`cast(${actionNis2}."updated_at" as text)`,
      })
        .from(actionNis2)
        .leftJoin(personne, eq(personne.id, actionNis2.responsableId))
        .leftJoin(exigenceNis2, eq(exigenceNis2.id, actionNis2.exigenceNis2Id))
        .leftJoin(objectifNis2, eq(objectifNis2.id, exigenceNis2.objectifNis2Id))
        .orderBy(asc(actionNis2.echeance), asc(actionNis2.intitule))
      for (const r of rows) {
        const echeance = r.echeance ? String(r.echeance) : null
        resultats.push({
          cadre: 'nis2', typeEnregistrement: 'action', ...r, echeance,
          // « En retard » est CALCULÉ, jamais stocké : une colonne serait fausse le
          // lendemain de son calcul.
          enRetard: !!(echeance && echeance < new Date().toISOString().slice(0, 10)
            && (r.statut === 'a_faire' || r.statut === 'en_cours')),
          url: '/plan-actions-nis2', urlAbsolue: urlPublique('/plan-actions-nis2'),
        })
      }
    }

    if (veut('iso27001') && cats.has('non-conformites')) {
      const rows = await db.select({
        id: nonConformite.id, intitule: nonConformite.nom, description: nonConformite.description,
        statut: nonConformite.statut, gravite: nonConformite.gravite, echeance: nonConformite.echeance,
        source: nonConformite.source, type: nonConformite.type,
        efficaciteVerifiee: nonConformite.efficaciteVerifiee,
        responsable: personne.nom,
        majLe: sql<string | null>`cast(${nonConformite}."updated_at" as text)`,
      })
        .from(nonConformite)
        .leftJoin(personne, eq(personne.id, nonConformite.responsableId))
        .orderBy(asc(nonConformite.echeance), asc(nonConformite.nom))
      for (const r of rows) {
        const echeance = r.echeance ? String(r.echeance) : null
        // `type` est aussi un champ de la non-conformité (audit, incident…) : l'étaler
        // après aurait silencieusement écrasé le type d'enregistrement. Renommé.
        resultats.push({
          cadre: 'iso27001', typeEnregistrement: 'non-conformite', ...r, echeance,
          enRetard: !!(echeance && echeance < new Date().toISOString().slice(0, 10) && r.statut !== 'close'),
          url: `/non-conformites/${r.id}`, urlAbsolue: urlPublique(`/non-conformites/${r.id}`),
        })
      }
    }

    const filtres = query.enRetard === 'true' ? resultats.filter(r => r.enRetard) : resultats
    return {
      total: filtres.length,
      tri: 'échéance croissante, puis intitulé',
      enRetard: resultats.filter(r => r.enRetard).length,
      resultats: filtres,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ cadre: t.Optional(t.String()), enRetard: t.Optional(t.String()) }),
    detail: {
      summary: 'Le plan d\'actions : actions NIS 2 et non-conformités ISO, avec responsable et échéance.',
      description: 'Deux sources, parce que les cadres travaillent différemment : une action NIS 2 est '
        + 'rattachée à une exigence, une non-conformité ISO porte sa propre correction. `enRetard` est '
        + 'CALCULÉ à la lecture (échéance dépassée et travail non clos) et jamais stocké. `enRetard` figure '
        + 'aussi au niveau de la réponse : c\'est le total en retard AVANT filtrage.',
    },
  })

  /** LES RISQUES : niveau brut, traitement décidé, niveau résiduel. */
  .get('/risques', async (ctx) => {
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('risques-smsi')) return { total: 0, tri: 'nom', lisible: false, resultats: [] }

    const rows = await db.select({
      id: risqueSmsi.id, nom: risqueSmsi.nom, menace: risqueSmsi.menace,
      vulnerabilite: risqueSmsi.vulnerabilite, proprieteImpactee: risqueSmsi.proprieteImpactee,
      vraisemblance: risqueSmsi.vraisemblance, gravite: risqueSmsi.gravite,
      traitement: risqueSmsi.traitement, statut: risqueSmsi.statut,
      vraisemblanceResiduelle: risqueSmsi.vraisemblanceResiduelle,
      graviteResiduelle: risqueSmsi.graviteResiduelle,
      risqueAccepte: risqueSmsi.risqueAccepte,
      actif: actifSmsi.nom, proprietaire: personne.nom,
      majLe: sql<string | null>`cast(${risqueSmsi}."updated_at" as text)`,
    })
      .from(risqueSmsi)
      .leftJoin(actifSmsi, eq(actifSmsi.id, risqueSmsi.actifSmsiId))
      .leftJoin(personne, eq(personne.id, risqueSmsi.proprietaireId))
      .orderBy(asc(risqueSmsi.nom))

    return {
      total: rows.length,
      tri: 'nom',
      lisible: true,
      resultats: rows.map(r => ({
        ...r,
        // Un risque SANS traitement décidé est le cas qui appelle une décision.
        sansTraitement: !r.traitement,
        url: `/risques-smsi/${r.id}`,
        urlAbsolue: urlPublique(`/risques-smsi/${r.id}`),
      })),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    detail: {
      summary: 'Les risques du SMSI : menace, vulnérabilité, niveau brut, traitement et niveau résiduel.',
      description: '`sansTraitement` isole les risques pour lesquels aucun traitement n\'a été décidé. '
        + '`lisible: false` signale que l\'appelant n\'a pas le droit de lire cette catégorie — à distinguer '
        + 'd\'un référentiel vide.',
    },
  })

  /**
   * LES ANALYSES D'IMPACT (AIPD). Une AIPD se rédige une fois, se classe, et personne ne la
   * rouvre : l'article 35.11 impose pourtant son réexamen.
   */
  .get('/aipd', async (ctx) => {
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('applications')) return { total: 0, tri: 'application', lisible: false, resultats: [] }

    const rows = await db.select({
      id: applicationRgpd.id, applicationId: applicationRgpd.applicationId,
      applicationNom: application.nom,
      aipdStatut: applicationRgpd.aipdStatut, aipdMotif: applicationRgpd.aipdMotif,
      aipdMotifPrecision: applicationRgpd.aipdMotifPrecision,
      aipdConclusion: applicationRgpd.aipdConclusion,
      aipdConclusionDetail: applicationRgpd.aipdConclusionDetail,
      aipdDate: applicationRgpd.aipdDate, aipdRevueDate: applicationRgpd.aipdRevueDate,
      notes: applicationRgpd.notes,
      majLe: sql<string | null>`cast(${applicationRgpd}."updated_at" as text)`,
    })
      .from(applicationRgpd)
      .innerJoin(application, eq(application.id, applicationRgpd.applicationId))
      .orderBy(asc(application.nom))

    const aujourdhui = new Date().toISOString().slice(0, 10)
    return {
      total: rows.length,
      tri: 'nom de l\'application',
      lisible: true,
      resultats: rows.map((r) => {
        const revue = r.aipdRevueDate ? String(r.aipdRevueDate) : null
        return {
          ...r,
          aipdDate: r.aipdDate ? String(r.aipdDate) : null,
          aipdRevueDate: revue,
          // Le réexamen exigé par l'article 35.11. Sans date de revue, il n'a jamais
          // lieu : « à réexaminer un jour » n'a jamais déclenché de réexamen.
          revueEchue: !!(revue && revue < aujourdhui),
          // Une AIPD TERMINÉE sans date de réexamen est le cas le plus discret : elle
          // compte comme faite dans tous les tableaux, et ne se rouvrira jamais.
          sansDateDeRevue: r.aipdStatut === 'terminee' && !revue,
          // Une AIPD due mais pas finie. `non_requise` n'en est pas une.
          enAttente: r.aipdStatut === 'a_faire' || r.aipdStatut === 'en_cours',
          url: `/applications/${r.applicationId}`,
          urlAbsolue: urlPublique(`/applications/${r.applicationId}`),
        }
      }),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    detail: {
      summary: 'Les analyses d\'impact (AIPD) par application : nécessité, conclusion, date de réexamen.',
      description: '`revueEchue` marque les AIPD dont la date de réexamen est dépassée (RGPD art. 35.11). '
        + '`sansDateDeRevue` marque celles qui sont REQUISES mais n\'ont aucune date de réexamen — le cas le '
        + 'plus discret, parce qu\'il ne déclenche jamais rien.',
    },
  })

  /**
   * RECHERCHE THÉMATIQUE dans le TEXTE des référentiels. « Quelles exigences parlent des mots
   * de passe ?
   */
  .get('/recherche', async (ctx) => {
    const { query, status } = ctx
    const cats = await readableCategories(accesDe(ctx))
    const termes = String(query.q ?? '').split(',').map(t => t.trim()).filter(t => t.length >= 3)
    if (!termes.length) return status(400, { message: 'Fournir au moins un terme d\'au moins 3 caractères (plusieurs possibles, séparés par des virgules).' })

    // Extrait centré sur la première occurrence : c'est lui qui rend la réponse citable.
    // Une référence sans le texte oblige à rouvrir la fiche pour savoir de quoi il s'agit.
    const extrait = (texte: string | null, terme: string): string | null => {
      if (!texte) return null
      const i = texte.toLowerCase().indexOf(terme.toLowerCase())
      if (i < 0) return null
      const debut = Math.max(0, i - 90)
      const fin = Math.min(texte.length, i + terme.length + 130)
      return `${debut > 0 ? '…' : ''}${texte.slice(debut, fin).replace(/\s+/g, ' ').trim()}${fin < texte.length ? '…' : ''}`
    }

    type Trouvaille = {
      cadre: string
      categorie: string
      id: string
      reference: string | null
      intitule: string
      champ: string
      terme: string
      extrait: string | null
      conformite: string | null
      url: string
      urlAbsolue: string
    }
    const trouvailles: Trouvaille[] = []
    const ajoute = (base: Omit<Trouvaille, 'champ' | 'terme' | 'extrait'>, champs: Record<string, string | null>) => {
      for (const terme of termes) {
        for (const [champ, valeur] of Object.entries(champs)) {
          const e = extrait(valeur, terme)
          if (e) { trouvailles.push({ ...base, champ, terme, extrait: e }); return }
        }
      }
    }

    const commeSql = (colonnes: AnyPgColumn[]) =>
      or(...termes.flatMap(t => colonnes.map(c => sql`cast(${c} as text) ilike ${'%' + t + '%'}`)))

    if (cats.has('exigences-nis2')) {
      const rows = await db.select().from(exigenceNis2)
        // `attenduEi` / `attenduEe` sont des BOOLÉENS (l'exigence s'applique-t-elle aux entités
        // essentielles / importantes), pas les attendus rédigés : la substance d'une exigence
        // NIS 2 est dans son intitulé, qui tient parfois un paragraphe.
        .where(commeSql([exigenceNis2.intitule, exigenceNis2.sousSection, exigenceNis2.observationsIso, exigenceNis2.reference]))
        .orderBy(asc(exigenceNis2.reference))
      for (const r of rows) {
        ajoute({
          cadre: 'nis2', categorie: 'exigences-nis2', id: r.id, reference: r.reference,
          intitule: r.intitule, conformite: r.conformite,
          url: `/exigences-nis2/${r.id}`, urlAbsolue: urlPublique(`/exigences-nis2/${r.id}`),
        }, {
          'intitulé': r.intitule,
          'sous-section': r.sousSection,
          'observations ISO': r.observationsIso,
        })
      }
    }

    if (cats.has('clauses-iso27001')) {
      const rows = await db.select().from(clauseIso27001)
        .where(commeSql([clauseIso27001.intitule, clauseIso27001.exigence, clauseIso27001.reference]))
        .orderBy(asc(clauseIso27001.ordre))
      for (const r of rows) {
        ajoute({
          cadre: 'iso27001', categorie: 'clauses-iso27001', id: r.id, reference: r.reference,
          intitule: r.intitule, conformite: r.conformite,
          url: `/clauses-iso27001/${r.id}`, urlAbsolue: urlPublique(`/clauses-iso27001/${r.id}`),
        }, { 'exigence': r.exigence, 'intitulé': r.intitule })
      }
    }

    // Les mesures de l'annexe A : c'est là que se trouvent les mesures TECHNIQUES, donc
    // le plus souvent ce qu'on cherche quand la question porte sur un sujet précis.
    if (cats.has('mesures-smsi')) {
      const rows = await db.select().from(mesureSmsi)
        .where(commeSql([mesureSmsi.intitule, mesureSmsi.objectif, mesureSmsi.description, mesureSmsi.reference]))
        .orderBy(asc(mesureSmsi.reference))
      for (const r of rows) {
        ajoute({
          cadre: 'iso27001-annexe-a', categorie: 'mesures-smsi', id: r.id, reference: r.reference,
          intitule: r.intitule, conformite: r.applicable === false ? 'non_applicable' : r.statut,
          url: `/mesures-smsi/${r.id}`, urlAbsolue: urlPublique(`/mesures-smsi/${r.id}`),
        }, { 'objectif': r.objectif, 'description': r.description, 'intitulé': r.intitule })
      }
    }

    if (cats.has('exigences-rgpd')) {
      const rows = await db.select().from(exigenceRgpd)
        .where(commeSql([exigenceRgpd.intitule, exigenceRgpd.extraitTexte, exigenceRgpd.reference]))
        .orderBy(asc(exigenceRgpd.ordre))
      for (const r of rows) {
        ajoute({
          cadre: 'rgpd', categorie: 'exigences-rgpd', id: r.id, reference: r.reference,
          intitule: r.intitule, conformite: r.conformite,
          url: '/rgpd', urlAbsolue: urlPublique('/rgpd'),
        }, { 'texte de l\'article': r.extraitTexte, 'intitulé': r.intitule })
      }
    }

    return {
      total: trouvailles.length,
      termes,
      tri: 'cadre, puis référence',
      parCadre: Object.fromEntries(
        [...new Set(trouvailles.map(t => t.cadre))].map(c => [c, trouvailles.filter(t => t.cadre === c).length]),
      ),
      avertissement: 'La correspondance est LITTÉRALE : aucun synonyme n\'est ajouté. '
        + `Les termes employés sont ${termes.map(t => `« ${t} »`).join(', ')} — un référentiel qui traite du sujet `
        + 'avec d\'autres mots ne ressort pas. Relancer avec d\'autres termes plutôt que conclure à une absence, '
        + 'et TOUJOURS dire quels termes ont été cherchés.',
      resultats: trouvailles.sort((a, b) => a.cadre.localeCompare(b.cadre) || (a.reference ?? '').localeCompare(b.reference ?? '')),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ q: t.String() }),
    detail: {
      summary: 'Cherche un thème dans le TEXTE des référentiels : « quelles exigences parlent des mots de passe ? ».',
      description: 'Balaie les attendus NIS 2, le texte des clauses ISO 27001, l\'objectif et la description '
        + 'des mesures de l\'annexe A, et les extraits d\'articles du RGPD. Rend le CHAMP où le terme '
        + 'apparaît et un EXTRAIT centré dessus, pour que la réponse soit citable sans rouvrir la fiche. '
        + 'Plusieurs termes séparés par des virgules : `q=mot de passe,authentification,identifiant`. '
        + 'La correspondance est littérale, sans synonymes — c\'est à l\'appelant de proposer ses termes et '
        + 'de dire lesquels il a employés.',
    },
  })

  /**
   * UNE EXIGENCE, ENTIÈRE, PAR SA RÉFÉRENCE. « Quel est notre plan pour l'exigence 1.1-EI/EE ?
   */
  .get('/exigence', async (ctx) => {
    const { query, status } = ctx
    const cats = await readableCategories(accesDe(ctx))
    // La référence passe en PARAMÈTRE DE REQUÊTE et non dans le chemin : les références NIS 2
    // contiennent une barre oblique (« 1.1-EI/EE ») que le routage consomme comme un séparateur
    // de segment, même encodée en %2F — la plupart des serveurs la décodent avant de router.
    const ref = String(query.reference ?? '').trim()
    if (!ref) return status(400, { message: 'Référence vide.' })
    const egal = (colonne: AnyPgColumn) => sql`lower(trim(cast(${colonne} as text))) = ${ref.toLowerCase()}`

    // --- NIS 2 -------------------------------------------------------------------------
    if (cats.has('exigences-nis2')) {
      const [e] = await db.select({
        exigence: exigenceNis2,
        objectifNumero: objectifNis2.numero,
        objectifIntitule: objectifNis2.intitule,
        domaine: objectifNis2.domaine,
      })
        .from(exigenceNis2)
        .leftJoin(objectifNis2, eq(objectifNis2.id, exigenceNis2.objectifNis2Id))
        .where(egal(exigenceNis2.reference)).limit(1)

      if (e) {
        const x = e.exigence
        const [responsables, actions, mesures] = await Promise.all([
          db.select({ personne: personne.nom, prenom: personne.prenom, email: personne.email, role: exigenceNis2Responsable.role })
            .from(exigenceNis2Responsable)
            .innerJoin(personne, eq(personne.id, exigenceNis2Responsable.personneId))
            .where(eq(exigenceNis2Responsable.exigenceNis2Id, x.id)),
          db.select({
            id: actionNis2.id, intitule: actionNis2.intitule, description: actionNis2.description,
            statut: actionNis2.statut, priorite: actionNis2.priorite, echeance: actionNis2.echeance,
            dateFait: actionNis2.dateFait, preuve: actionNis2.preuve, responsable: personne.nom,
          })
            .from(actionNis2)
            .leftJoin(personne, eq(personne.id, actionNis2.responsableId))
            .where(eq(actionNis2.exigenceNis2Id, x.id))
            .orderBy(asc(actionNis2.echeance)),
          cats.has('mesures-smsi')
            ? db.select({ id: mesureSmsi.id, reference: mesureSmsi.reference, intitule: mesureSmsi.intitule, statut: mesureSmsi.statut, preuve: mesureSmsi.preuve })
              .from(exigenceNis2Mesure)
              .innerJoin(mesureSmsi, eq(mesureSmsi.id, exigenceNis2Mesure.mesureSmsiId))
              .where(eq(exigenceNis2Mesure.exigenceNis2Id, x.id))
              .orderBy(asc(mesureSmsi.reference))
            : Promise.resolve([]),
        ])

        const aujourdhui = new Date().toISOString().slice(0, 10)
        return {
          cadre: 'nis2',
          reference: x.reference,
          intitule: x.intitule,
          sousSection: x.sousSection,
          objectif: e.objectifNumero ? `${e.objectifNumero} — ${e.objectifIntitule}` : null,
          domaine: e.domaine,
          // `attenduEi` / `attenduEe` sont des BOOLÉENS d'applicabilité, pas des textes :
          // ils disent à QUI l'exigence s'impose, pas ce qu'elle demande.
          applicableEntiteEssentielle: x.attenduEi,
          applicableEntiteImportante: x.attenduEe,
          etat: {
            conformite: x.conformite,
            statut: x.statut,
            echeance: x.echeance ? String(x.echeance) : null,
            // Le champ que la question vise directement.
            plan: x.plan,
            preuve: x.preuve,
            notes: x.notes,
          },
          responsables: responsables.map(r => ({ nom: `${r.prenom ?? ''} ${r.personne}`.trim(), email: r.email, role: r.role })),
          actions: actions.map(a => ({
            ...a,
            echeance: a.echeance ? String(a.echeance) : null,
            enRetard: !!(a.echeance && String(a.echeance) < aujourdhui && (a.statut === 'a_faire' || a.statut === 'en_cours')),
          })),
          correspondanceIso: x.correspondanceIso,
          observationsIso: x.observationsIso,
          mesuresIso: mesures,
          urlAbsolue: urlPublique(`/exigences-nis2/${x.id}`),
          // Ce qui manque se dit, plutôt que de laisser un champ vide parler pour lui.
          manques: [
            !x.conformite ? 'Conformité jamais évaluée.' : null,
            !x.plan?.trim() ? 'Aucun plan d\'action écrit.' : null,
            !responsables.length ? 'Aucun responsable désigné.' : null,
            !actions.length ? 'Aucune action engagée.' : null,
            !x.preuve?.trim() ? 'Aucune preuve versée.' : null,
          ].filter(Boolean),
        }
      }
    }

    // --- ISO 27001 : clauses du système de management -----------------------------------
    if (cats.has('clauses-iso27001')) {
      const [c] = await db.select().from(clauseIso27001).where(egal(clauseIso27001.reference)).limit(1)
      if (c) {
        const [responsable] = c.responsableId
          ? await db.select({ nom: personne.nom, prenom: personne.prenom, email: personne.email })
            .from(personne).where(eq(personne.id, c.responsableId)).limit(1)
          : []
        // Les non-conformités sont le plan d'action réel de l'ISO : le champ `plan` est un
        // texte, elles sont des engagements datés avec un responsable.
        const ncs = cats.has('non-conformites')
          ? await db.select({
            id: nonConformite.id, intitule: nonConformite.nom, statut: nonConformite.statut,
            gravite: nonConformite.gravite, echeance: nonConformite.echeance,
            source: nonConformite.source, responsable: personne.nom,
          })
            .from(nonConformite)
            .leftJoin(personne, eq(personne.id, nonConformite.responsableId))
            .where(ilike(nonConformite.nom, `%${c.reference}%`))
            .orderBy(asc(nonConformite.echeance))
          : []
        // Le chemin inverse : quelles exigences NIS 2 renvoient à cette clause. C'est ce
        // qui évite de traiter deux fois le même travail.
        const nis2Liees = cats.has('exigences-nis2')
          ? await db.select({ reference: exigenceNis2.reference, intitule: exigenceNis2.intitule, conformite: exigenceNis2.conformite })
            .from(exigenceNis2Iso)
            .innerJoin(exigenceNis2, eq(exigenceNis2.id, exigenceNis2Iso.exigenceNis2Id))
            .where(eq(exigenceNis2Iso.reference, c.reference))
            .orderBy(asc(exigenceNis2.reference))
          : []
        return {
          cadre: 'iso27001', reference: c.reference, intitule: c.intitule, chapitre: c.chapitre,
          texte: c.exigence, amendement: c.amendement,
          etat: { conformite: c.conformite, statut: c.statut, echeance: c.echeance ? String(c.echeance) : null, plan: c.plan, preuve: c.preuve, notes: c.notes },
          responsable: responsable ? { nom: `${responsable.prenom ?? ''} ${responsable.nom}`.trim(), email: responsable.email } : null,
          nonConformites: ncs.map(n => ({ ...n, echeance: n.echeance ? String(n.echeance) : null })),
          exigencesNis2Liees: nis2Liees,
          urlAbsolue: urlPublique(`/clauses-iso27001/${c.id}`),
          manques: [
            !c.conformite ? 'Conformité jamais évaluée.' : null,
            !c.plan?.trim() ? 'Aucun plan d\'action écrit.' : null,
            !responsable ? 'Aucun responsable désigné.' : null,
            !c.preuve?.trim() ? 'Aucune preuve versée.' : null,
          ].filter(Boolean),
        }
      }
    }

    // --- Annexe A : mesures de la déclaration d'applicabilité ---------------------------
    if (cats.has('mesures-smsi')) {
      const [m] = await db.select().from(mesureSmsi)
        .where(or(egal(mesureSmsi.reference), sql`lower(trim(cast(${mesureSmsi.reference} as text))) = ${'a.' + ref.toLowerCase()}`))
        .limit(1)
      if (m) {
        const [respM] = m.responsableId
          ? await db.select({ nom: personne.nom, prenom: personne.prenom, email: personne.email })
            .from(personne).where(eq(personne.id, m.responsableId)).limit(1)
          : []
        const nis2Mesure = cats.has('exigences-nis2')
          ? await db.select({ reference: exigenceNis2.reference, intitule: exigenceNis2.intitule, conformite: exigenceNis2.conformite })
            .from(exigenceNis2Mesure)
            .innerJoin(exigenceNis2, eq(exigenceNis2.id, exigenceNis2Mesure.exigenceNis2Id))
            .where(eq(exigenceNis2Mesure.mesureSmsiId, m.id))
            .orderBy(asc(exigenceNis2.reference))
          : []
        return {
          cadre: 'iso27001-annexe-a', reference: m.reference, intitule: m.intitule,
          theme: m.theme, objectif: m.objectif, texte: m.description,
          typeMesure: m.typeMesure, proprietes: m.proprietes, capacites: m.capacites,
          etat: { applicable: m.applicable, justification: m.justification, statut: m.statut, preuve: m.preuve, notes: m.notes },
          responsable: respM ? { nom: `${respM.prenom ?? ''} ${respM.nom}`.trim(), email: respM.email } : null,
          exigencesNis2Liees: nis2Mesure,
          urlAbsolue: urlPublique(`/mesures-smsi/${m.id}`),
          manques: [
            m.applicable && !m.preuve?.trim() ? 'Mesure déclarée applicable sans preuve : un auditeur ne pourra pas la vérifier.' : null,
            m.applicable === false && !m.justification?.trim() ? 'Mesure écartée sans justification écrite.' : null,
          ].filter(Boolean),
        }
      }
    }

    // --- RGPD ---------------------------------------------------------------------------
    if (cats.has('exigences-rgpd')) {
      const [r] = await db.select().from(exigenceRgpd)
        .where(or(egal(exigenceRgpd.reference), egal(exigenceRgpd.article))).limit(1)
      if (r) {
        return {
          cadre: 'rgpd', reference: r.reference, article: r.article, intitule: r.intitule,
          texte: r.extraitTexte, portee: r.portee,
          etat: { conformite: r.conformite, statut: r.statut, echeance: r.echeance ? String(r.echeance) : null, plan: r.plan, preuve: r.preuve, notes: r.notes },
          urlAbsolue: urlPublique('/rgpd'),
          manques: [
            !r.conformite ? 'Conformité jamais évaluée.' : null,
            !r.plan?.trim() ? 'Aucun plan d\'action écrit.' : null,
          ].filter(Boolean),
        }
      }
    }

    return status(404, {
      message: `Aucune exigence, clause ou mesure ne porte la référence « ${ref} » dans les cadres lisibles par cet appelant.`,
      // Ne PAS laisser conclure « ça n'existe pas » quand c'est peut-être « je n'y ai pas accès ».
      consequence: 'Cela peut vouloir dire que la référence n\'existe pas, OU que le cadre concerné est hors de la portée de l\'appelant.',
    })
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ reference: t.String() }),
    detail: {
      summary: 'Une exigence entière par sa référence : état, plan, responsables, actions, correspondances.',
      description: 'Appel : `GET /api/conformite/exigence?reference=1.1-EI/EE`. La référence passe en '
        + 'PARAMÈTRE DE REQUÊTE parce que les références NIS 2 contiennent une barre oblique. Cherche dans '
        + 'les quatre référentiels (NIS 2, clauses ISO 27001, mesures de l\'annexe A, RGPD) ; la casse et les '
        + 'espaces sont ignorés, et « 5.9 » trouve aussi « A.5.9 ». Le champ `manques` énumère ce qui n\'est '
        + 'PAS renseigné (pas de plan, pas de responsable, pas de preuve) — un champ vide doit être annoncé '
        + 'comme tel, jamais passé sous silence. Un 404 peut signifier « hors de la portée de l\'appelant » '
        + 'et pas « n\'existe pas ».',
    },
  })

  /** Où en est-on, cadre par cadre. Des compteurs, pas des lignes. */
  .get('/resume', async (ctx) => {
    const cats = await readableCategories(accesDe(ctx))
    const compte = async <T>(categorie: string, f: () => Promise<T>) =>
      (cats.has(categorie) ? await f() : null)

    const [nis2, iso, rgpd, soa, risques, actions, nc, aipd, appsRgpd, pilotage] = await Promise.all([
      // PARTITION COMPLÈTE, dérivée de l'énumération. Ce bloc comptait `conformes`,
      // `nonApplicables` et `nonEvaluees` — soit UNE des quatre valeurs de conformité, plus
      // deux cas particuliers.
      compte('exigences-nis2', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        conformes: sql<number>`count(*) filter (where ${exigenceNis2.conformite} = ${CONFORME.nis2})::int`,
        nonApplicables: sql<number>`count(*) filter (where ${exigenceNis2.statut} = 'non_applicable')::int`,
        parConformite: {
          ...partitionAvecNul(exigenceNis2.conformite, nis2Conformite.enumValues, 'non_evaluee'),
        },
        parStatut: { ...partitionAvecNul(exigenceNis2.statut, nis2Statut.enumValues, 'non_renseigne') },
        nonEvaluees: sql<number>`count(*) filter (where ${exigenceNis2.conformite} is null)::int`,
      }).from(exigenceNis2))[0]),
      compte('clauses-iso27001', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        conformes: sql<number>`count(*) filter (where ${clauseIso27001.conformite} = ${CONFORME.iso27001})::int`,
        nonApplicables: sql<number>`count(*) filter (where ${clauseIso27001.conformite} = 'non_applicable')::int`,
        parConformite: {
          ...partitionAvecNul(clauseIso27001.conformite, iso27001Conformite.enumValues, 'non_evaluee'),
        },
        nonEvaluees: sql<number>`count(*) filter (where ${clauseIso27001.conformite} is null)::int`,
      }).from(clauseIso27001))[0]),
      compte('exigences-rgpd', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        conformes: sql<number>`count(*) filter (where ${exigenceRgpd.conformite} = ${CONFORME.rgpd})::int`,
        nonApplicables: sql<number>`count(*) filter (where ${exigenceRgpd.conformite} = 'non_applicable')::int`,
        parConformite: {
          ...partitionAvecNul(exigenceRgpd.conformite, rgpdConformite.enumValues, 'non_evaluee'),
        },
        nonEvaluees: sql<number>`count(*) filter (where ${exigenceRgpd.conformite} is null)::int`,
      }).from(exigenceRgpd))[0]),
      compte('mesures-smsi', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        applicables: sql<number>`count(*) filter (where ${mesureSmsi.applicable})::int`,
        // Une mesure applicable SANS preuve est une déclaration d'applicabilité qu'un
        // auditeur ne pourra pas vérifier.
        sansPreuve: sql<number>`count(*) filter (where ${mesureSmsi.applicable} and coalesce(trim(${mesureSmsi.preuve}), '') = '')::int`,
      }).from(mesureSmsi))[0]),
      compte('risques-smsi', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        sansTraitement: sql<number>`count(*) filter (where ${risqueSmsi.traitement} is null)::int`,
        acceptes: sql<number>`count(*) filter (where ${risqueSmsi.risqueAccepte})::int`,
      }).from(risqueSmsi))[0]),
      compte('actions-nis2', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        fait: sql<number>`count(*) filter (where ${actionNis2.statut} = 'fait')::int`,
        enRetard: sql<number>`count(*) filter (where ${actionNis2.statut} in ('a_faire','en_cours') and ${actionNis2.echeance} < current_date)::int`,
      }).from(actionNis2))[0]),
      compte('non-conformites', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        ouvertes: sql<number>`count(*) filter (where ${nonConformite.statut}::text is distinct from 'close')::int`,
      }).from(nonConformite))[0]),
      compte('applications', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        dues: sql<number>`count(*) filter (where ${applicationRgpd.aipdStatut} in ('a_faire', 'en_cours'))::int`,
        terminees: sql<number>`count(*) filter (where ${applicationRgpd.aipdStatut} = 'terminee')::int`,
        revueEchue: sql<number>`count(*) filter (where ${applicationRgpd.aipdRevueDate} < current_date)::int`,
        sansDateDeRevue: sql<number>`count(*) filter (where ${applicationRgpd.aipdStatut} = 'terminee' and ${applicationRgpd.aipdRevueDate} is null)::int`,
        // `dues` et `terminees` couvraient deux valeurs sur cinq : « combien d'AIPD non
        // nécessaires » n'avait pas de réponse. Partition dérivée de l'énumération.
        parStatut: { ...partitionAvecNul(applicationRgpd.aipdStatut, aipdStatut.enumValues, 'non_renseigne') },
      }).from(applicationRgpd))[0]),
      // ÉTAT RGPD DES APPLICATIONS — le décompte que l'assistant cite au lieu de compter.
      compte('applications', async () => (await db.select({
        total: sql<number>`count(*)::int`,
        ecart: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'ecart')::int`,
        conformes: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'conforme')::int`,
        nonEvaluees: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'non_evalue')::int`,
        horsPerimetre: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'hors_perimetre')::int`,
      }).from(application))[0]),
      // PILOTAGE DU SMSI (ISO 27001 §9.2 et §9.3) — audits et revues de direction.
      compte('revues-direction', async () => {
        const [r] = await db.select({
          total: sql<number>`count(*)::int`,
          derniereRealisee: sql<string | null>`max(${revueDirection.date}) filter (where ${revueDirection.statut} = 'realisee')`,
          prochainePlanifiee: sql<string | null>`min(${revueDirection.date}) filter (where ${revueDirection.statut} = 'planifiee' and ${revueDirection.date} >= current_date)`,
          planifieesSansDate: sql<number>`count(*) filter (where ${revueDirection.statut} = 'planifiee' and ${revueDirection.date} is null)::int`,
        }).from(revueDirection)
        const [a2] = await db.select({
          total: sql<number>`count(*)::int`,
          // `dateDebut` : le modèle ne porte pas de date prévisionnelle distincte, c'est
          // la même colonne avant et après réalisation.
          prochain: sql<string | null>`min(${auditSmsi.dateDebut}) filter (where ${auditSmsi.statut} in ('planifie','en_cours') and ${auditSmsi.dateDebut} >= current_date)`,
        }).from(auditSmsi)
        return {
          revues: r,
          audits: a2,
          // Une revue planifiée SANS date n'est pas une revue programmée : elle ne peut pas
          // devenir `prochainePlanifiee`, et l'omettre laisserait croire à un oubli de saisie
          // plutôt qu'à une planification incomplète.
          avertissement: r?.planifieesSansDate
            ? `${r.planifieesSansDate} revue(s) marquée(s) planifiée(s) sans date : elles ne comptent pas `
              + 'dans `prochainePlanifiee`. Une revue sans date n\'est pas programmée.'
            : null,
        }
      }),
    ])

    // `null` signifie « l'appelant n'a pas le droit de lire ce cadre », ce qui n'est PAS un
    // cadre vide.
    return { nis2, iso27001: iso, rgpd, soa, risques, actions, nonConformites: nc, aipd, applicationsRgpd: appsRgpd, pilotageSmsi: pilotage }
  }, {
    auth: ['user', 'admin', 'svc'],
    detail: {
      summary: 'Où en est-on, cadre par cadre : compteurs NIS 2, ISO 27001, RGPD, SoA, risques, AIPD.',
      description: 'Un bloc `null` signifie que l\'appelant n\'a PAS le droit de lire ce cadre — à ne jamais '
        + 'confondre avec un cadre vide, sous peine d\'annoncer « rien à signaler » sur un référentiel qu\'on '
        + 'n\'a pas regardé. `applicationsRgpd` ventile les applications par état RGPD : `ecart` est un '
        + 'manquement mesuré, `nonEvaluees` du travail à faire — les agréger annoncerait un manquement sur '
        + 'tout ce que personne n\'a encore regardé. `horsPerimetre` n\'entre dans aucun des deux.',
    },
  })
