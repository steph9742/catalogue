import { Elysia, t } from 'elysia'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  actifSmsi,
  evenementRedoute,
  partiePrenante,
  scenarioOperationnel,
  scenarioStrategique,
  sourceRisque,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// EBIOS RM — vues enrichies des ateliers 2/3/4 que le CRUD générique ne sait pas produire :
// cartographie de l'écosystème (niveau de menace calculé), scénarios stratégiques joints à
// leurs entités et comptés en opérationnels, et la synthèse.

// Niveau de menace d'une partie prenante (EBIOS RM, atelier 3). exposition = dépendance ×
// pénétration (ce qui rend la partie dangereuse) fiabilité = maturité cyber × confiance (ce qui
// la rend sûre) menace = exposition / fiabilité (plus c'est haut, plus c'est critique) Le
// placement en zone (danger /…
function niveauMenace(pp: {
  dependance: number | null
  penetration: number | null
  maturiteCyber: number | null
  confiance: number | null
}) {
  const dep = pp.dependance ?? 0
  const pen = pp.penetration ?? 0
  const mat = pp.maturiteCyber ?? 0
  const conf = pp.confiance ?? 0
  const evaluee = !!(pp.dependance && pp.penetration && pp.maturiteCyber && pp.confiance)
  const exposition = dep * pen
  const fiabilite = mat * conf
  const menace = evaluee ? Math.round((exposition / fiabilite) * 100) / 100 : null
  // Seuils EBIOS usuels : > 3 zone de danger, > 1,5 zone de contrôle, > 0,75 veille.
  const zone = menace == null
    ? 'non_evaluee'
    : menace > 3 ? 'danger' : menace > 1.5 ? 'controle' : menace > 0.75 ? 'veille' : 'negligeable'
  return { exposition, fiabilite, menace, zone }
}

export const ebiosRouter = new Elysia({ name: 'ebios' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Conformité'] } })

  // --- Écosystème : parties prenantes + niveau de menace calculé --------------------
  .get('/api/ebios/ecosysteme', async () => {
    const rows = await db.select().from(partiePrenante).orderBy(asc(partiePrenante.nom))
    return rows.map(pp => ({ ...pp, ...niveauMenace(pp) }))
  }, { can: { category: 'parties-prenantes', level: 'read' } })

  // --- Scénarios stratégiques enrichis (noms des entités + nb d'opérationnels) -------
  .get('/api/ebios/scenarios-strategiques', async () =>
    db
      .select({
        id: scenarioStrategique.id,
        nom: scenarioStrategique.nom,
        gravite: scenarioStrategique.gravite,
        cheminAttaque: scenarioStrategique.cheminAttaque,
        sourceRisqueId: scenarioStrategique.sourceRisqueId,
        sourceRisque: sourceRisque.nom,
        sourceRisquePertinence: sourceRisque.pertinence,
        evenementRedouteId: scenarioStrategique.evenementRedouteId,
        evenementRedoute: evenementRedoute.nom,
        partiePrenanteId: scenarioStrategique.partiePrenanteId,
        partiePrenante: partiePrenante.nom,
        nbOperationnels: sql<number>`count(${scenarioOperationnel.id})::int`,
      })
      .from(scenarioStrategique)
      .leftJoin(sourceRisque, eq(sourceRisque.id, scenarioStrategique.sourceRisqueId))
      .leftJoin(evenementRedoute, eq(evenementRedoute.id, scenarioStrategique.evenementRedouteId))
      .leftJoin(partiePrenante, eq(partiePrenante.id, scenarioStrategique.partiePrenanteId))
      .leftJoin(scenarioOperationnel, eq(scenarioOperationnel.scenarioStrategiqueId, scenarioStrategique.id))
      .groupBy(scenarioStrategique.id, sourceRisque.nom, sourceRisque.pertinence, evenementRedoute.nom, partiePrenante.nom)
      .orderBy(asc(scenarioStrategique.nom)),
  { can: { category: 'scenarios-strategiques', level: 'read' } })

  // --- Scénarios opérationnels d'un scénario stratégique -----------------------------
  .get('/api/scenarios-strategiques/:id/operationnels', async ({ params }) =>
    db
      .select({
        id: scenarioOperationnel.id,
        nom: scenarioOperationnel.nom,
        vraisemblance: scenarioOperationnel.vraisemblance,
        sequence: scenarioOperationnel.sequence,
        modeOperatoire: scenarioOperationnel.modeOperatoire,
        bienSupportId: scenarioOperationnel.bienSupportId,
        bienSupport: actifSmsi.nom,
      })
      .from(scenarioOperationnel)
      .leftJoin(actifSmsi, eq(actifSmsi.id, scenarioOperationnel.bienSupportId))
      .where(eq(scenarioOperationnel.scenarioStrategiqueId, params.id))
      .orderBy(asc(scenarioOperationnel.nom)),
  { can: { category: 'scenarios-operationnels', level: 'read' }, params: t.Object({ id: t.String() }) })

  // --- Synthèse EBIOS (compteurs pour le tableau de bord de l'analyse) ---------------
  .get('/api/ebios/synthese', async () => {
    const [sr] = await db
      .select({
        total: sql<number>`count(*)::int`,
        retenues: sql<number>`count(*) filter (where ${sourceRisque.pertinence} = 'retenue')::int`,
        aSurveiller: sql<number>`count(*) filter (where ${sourceRisque.pertinence} = 'a_surveiller')::int`,
      })
      .from(sourceRisque)
    const [strat] = await db.select({ total: sql<number>`count(*)::int` }).from(scenarioStrategique)
    const [ope] = await db.select({ total: sql<number>`count(*)::int` }).from(scenarioOperationnel)
    const pp = await db.select().from(partiePrenante)
    const zones = { danger: 0, controle: 0, veille: 0, negligeable: 0, non_evaluee: 0 }
    for (const p of pp) zones[niveauMenace(p).zone as keyof typeof zones]++
    return { sourcesRisque: sr, scenariosStrategiques: strat?.total ?? 0, scenariosOperationnels: ope?.total ?? 0, partiesPrenantes: { total: pp.length, zones } }
  }, { can: { category: 'scenarios-strategiques', level: 'read' } })
