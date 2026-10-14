import { Elysia, t } from 'elysia'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  application,
  applicationExigenceRgpd,
  applicationRgpd,
  exigenceRgpd,
  exigenceRgpdLien,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// RGPD — référentiel d'établissement + volet par application (traitement).

// Exigences à cocher sur une fiche application : celles de portée application, MOINS l'article
// 35, porté par le bloc d'analyse d'impact (motif, conclusion, dates, pièces — bien plus qu'un
// état de conformité).
const CONDITION_PAR_APPLICATION = and(
  inArray(exigenceRgpd.portee, ['application', 'les_deux']),
  sql`${exigenceRgpd.article} <> 35`,
)

/**
 * QUATRE ÉTATS, et la nuance entre les deux premiers est tout l'intérêt du dispositif.
 */
/** Les quatre états, dans l'ordre où le `case` les tranche. Fermé : voir ETAT_RGPD. */
export const ETATS_RGPD = ['hors_perimetre', 'ecart', 'conforme', 'non_evalue'] as const
export type EtatRgpd = typeof ETATS_RGPD[number]

/**
 * L'expression SQL de l\'état, ÉCRITE UNE SEULE FOIS. Utilisable en colonne de `select`, en
 * condition de `where` et en `filter (where …)` d'un compteur.
 */
export function expressionEtatRgpd() {
  const total = sql<number>`(select count(*)::int from ${exigenceRgpd}
    where ${exigenceRgpd.portee} in ('application','les_deux') and ${exigenceRgpd.article} <> 35)`
  const evaluees = sql<number>`(select count(*)::int from ${applicationExigenceRgpd} a
    join ${exigenceRgpd} e on e.id = a.exigence_rgpd_id
    where a.application_id = ${application}."id"
      and e.portee in ('application','les_deux') and e.article <> 35)`
  const ecarts = sql<number>`(select count(*)::int from ${applicationExigenceRgpd} a
    join ${exigenceRgpd} e on e.id = a.exigence_rgpd_id
    where a.application_id = ${application}."id" and a.etat = 'non_conforme'
      and e.portee in ('application','les_deux') and e.article <> 35)`
  return sql<EtatRgpd>`
      case
        when ${application.donneesPersonnelles} is not true then 'hors_perimetre'
        when ${ecarts} > 0 then 'ecart'
        when ${evaluees} >= ${total} then 'conforme'
        else 'non_evalue'
      end`
}

export function selectionEtatRgpd() {
  // CORRÉLATION QUALIFIÉE À LA MAIN (`${application}."id"`, table + colonne, et non
  // `${application.id}`) : quand un fragment sql`` est un champ de PREMIER NIVEAU du select,
  // drizzle rend la colonne SANS sa table (« "id" » nu).
  const total = sql<number>`(select count(*)::int from ${exigenceRgpd}
    where ${exigenceRgpd.portee} in ('application','les_deux') and ${exigenceRgpd.article} <> 35)`
  // Les comptes joignent le référentiel et reprennent LA MÊME condition que `total` : un état
  // enregistré sur une exigence hors périmètre (article 35, portée établissement, ou exigence
  // retirée du référentiel) ne doit ni gonfler « évaluées » — on a vu 14/8 — ni pousser
  // artificiellement une application…
  const evaluees = sql<number>`(select count(*)::int from ${applicationExigenceRgpd} a
    join ${exigenceRgpd} e on e.id = a.exigence_rgpd_id
    where a.application_id = ${application}."id"
      and e.portee in ('application','les_deux') and e.article <> 35)`
  const ecarts = sql<number>`(select count(*)::int from ${applicationExigenceRgpd} a
    join ${exigenceRgpd} e on e.id = a.exigence_rgpd_id
    where a.application_id = ${application}."id" and a.etat = 'non_conforme'
      and e.portee in ('application','les_deux') and e.article <> 35)`
  // `non_applicable` compte comme évaluée : écarter une exigence est une réponse, pourvu
  // qu'elle soit justifiée — c'est le rôle du champ `justification`.
  return {
    // L'EXPRESSION EST RENDUE PAR `expressionEtatRgpd()`, et non écrite ici.
    etatRgpd: expressionEtatRgpd(),
    rgpdEcarts: ecarts,
    rgpdEvaluees: evaluees,
    rgpdTotal: total,
    aipdStatut: sql<string | null>`(select r.aipd_statut from ${applicationRgpd} r
      where r.application_id = ${application}."id")`,
    aipdConclusion: sql<string | null>`(select r.aipd_conclusion from ${applicationRgpd} r
      where r.application_id = ${application}."id")`,
  }
}

export const rgpdRouter = new Elysia({ name: 'rgpd' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Conformité'] } })

  // Référentiel d'établissement, avec ses rapprochements. `niveau=application` renvoie
  // EXACTEMENT ce que la fiche affiche — même condition, même constante.
  .get('/api/rgpd/exigences', async ({ query }) => {
    const filtre = query.niveau === 'application'
      ? CONDITION_PAR_APPLICATION
      : query.portee ? eq(exigenceRgpd.portee, query.portee) : undefined
    const rows = await db.select().from(exigenceRgpd)
      .where(filtre)
      .orderBy(asc(exigenceRgpd.ordre))
    const liens = await db.select().from(exigenceRgpdLien)
    const parExigence = new Map<string, typeof liens>()
    for (const l of liens) {
      const acc = parExigence.get(l.exigenceRgpdId) ?? []
      acc.push(l)
      parExigence.set(l.exigenceRgpdId, acc)
    }
    return rows.map(e => ({ ...e, liens: parExigence.get(e.id) ?? [] }))
  }, {
    can: { category: 'exigences-rgpd', level: 'read' },
    query: t.Object({
      portee: t.Optional(t.Union([t.Literal('etablissement'), t.Literal('application'), t.Literal('les_deux')])),
      niveau: t.Optional(t.Literal('application')),
    }),
  })

  // Volet RGPD d'une application : bloc d'analyse d'impact + état de chaque exigence.
  .get('/api/applications/:id/rgpd', async ({ params }) => {
    const [bloc] = await db.select().from(applicationRgpd)
      .where(eq(applicationRgpd.applicationId, params.id)).limit(1)
    const exigences = await db.select({
      id: exigenceRgpd.id,
      reference: exigenceRgpd.reference,
      article: exigenceRgpd.article,
      intituleArticle: exigenceRgpd.intituleArticle,
      intitule: exigenceRgpd.intitule,
      ordre: exigenceRgpd.ordre,
      etat: applicationExigenceRgpd.etat,
      justification: applicationExigenceRgpd.justification,
    })
      .from(exigenceRgpd)
      .leftJoin(
        applicationExigenceRgpd,
        and(
          eq(applicationExigenceRgpd.exigenceRgpdId, exigenceRgpd.id),
          eq(applicationExigenceRgpd.applicationId, params.id),
        ),
      )
      .where(CONDITION_PAR_APPLICATION)
      .orderBy(asc(exigenceRgpd.ordre))
    return { bloc: bloc ?? null, exigences }
  }, { can: { category: 'applications', level: 'read' }, params: t.Object({ id: t.String() }) })

  // LES ÉCRITURES DU VOLET RGPD PASSENT PAR LE FORMULAIRE DE L'APPLICATION, pas par ici.

  // Rapprochements vers NIS 2 / ISO : modifiables, puisqu'ils ne sont pas officiels.
  .patch('/api/rgpd/liens/:id', async ({ params, body }) => {
    const [row] = await db.update(exigenceRgpdLien)
      .set({
        justification: body.justification?.trim() || null,
        // Enregistre QUAND quelqu'un a réellement relu ce rapprochement — sans quoi
        // « validé » ne voudrait rien dire.
        valideLe: body.valide ? new Date().toISOString().slice(0, 10) : null,
        updatedAt: new Date(),
      })
      .where(eq(exigenceRgpdLien.id, params.id))
      .returning()
    return row
  }, {
    can: { category: 'exigences-rgpd', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ justification: t.Optional(t.String()), valide: t.Optional(t.Boolean()) }),
  })

  .post('/api/rgpd/exigences/:id/liens', async ({ params, body }) => {
    const [row] = await db.insert(exigenceRgpdLien).values({
      exigenceRgpdId: params.id,
      cible: body.cible,
      reference: body.reference.trim(),
      intitule: body.intitule?.trim() || null,
      justification: body.justification?.trim() || null,
      officiel: false,
    }).onConflictDoNothing().returning()
    return row ?? { deja: true as const }
  }, {
    can: { category: 'exigences-rgpd', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      cible: t.Union([t.Literal('nis2'), t.Literal('iso27001'), t.Literal('iso27002')]),
      reference: t.String({ minLength: 1 }),
      intitule: t.Optional(t.String()),
      justification: t.Optional(t.String()),
    }),
  })

  .delete('/api/rgpd/liens/:id', async ({ params }) => {
    await db.delete(exigenceRgpdLien).where(eq(exigenceRgpdLien.id, params.id))
    return { ok: true as const }
  }, { can: { category: 'exigences-rgpd', level: 'write' }, params: t.Object({ id: t.String() }) })
