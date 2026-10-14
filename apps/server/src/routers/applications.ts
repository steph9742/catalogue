import { Elysia, t } from 'elysia'
import { eq, desc, getTableColumns, sql } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-typebox'
import { db } from '@catalogue/database'
import {
  application, deploiement, applicationTechnologie, responsabilite,
  intervention, applicationPopulation, applicationGroupe,
  applicationRgpd, applicationExigenceRgpd,
  appStatut, appExposition, appHebergement, appSensibilite, appCriticite,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { lotRoutes } from './lot'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'
import { makeImport } from './importHelper'
import { IMPORT_REFERENCES } from './importRefs'
import { beforeSnapshot } from '../utils/audit'
import { ETATS_RGPD, expressionEtatRgpd, selectionEtatRgpd } from './rgpd'
import { partitionAvecNul } from '../utils/partition'
import { ventiler } from '../utils/ventilation'
import { pole } from '@catalogue/database/tables'

// Fiche application : champs cœur + relations (déploiements, technos, responsables,
// prestataires, populations, groupes) gérées EN LIGNE dans le même enregistrement, pour passer
// par le workflow de validation et le RBAC de la catégorie 'applications'.
const insertApplication = createInsertSchema(application)
const coreBody = t.Omit(insertApplication, ['id', 'createdAt', 'updatedAt'])

const deploiementItem = t.Object({
  serveurId: t.String(),
  role: t.String(),
  rolePrecision: t.Optional(t.Union([t.String(), t.Null()])),
  environnement: t.Optional(t.Union([t.String(), t.Null()])),
})
const responsabiliteItem = t.Object({ personneId: t.String(), role: t.String() })
// VOLET RGPD — enregistré AVEC la fiche, et non par des routes séparées.
const aipdMotifSchema = t.Union([
  t.Literal('evaluation_scoring'), t.Literal('decision_automatisee'), t.Literal('surveillance_systematique'),
  t.Literal('donnees_sensibles'), t.Literal('grande_echelle'), t.Literal('croisement_donnees'),
  t.Literal('personnes_vulnerables'), t.Literal('usage_innovant'), t.Literal('liste_cnil'), t.Literal('autre'),
])
const aipdConclusionSchema = t.Union([
  t.Literal('risque_acceptable'), t.Literal('acceptable_sous_reserve'),
  t.Literal('risque_eleve_consultation'), t.Literal('traitement_modifie'),
])
// AAAA-MM-JJ strict : ce que produisent les champs <input type="date">, et rien d'autre.
const dateIso = t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })

const rgpdBloc = t.Object({
  aipdStatut: t.Union([t.Literal('non_requise'), t.Literal('a_faire'), t.Literal('en_cours'), t.Literal('terminee')]),
  aipdMotif: t.Optional(t.Union([aipdMotifSchema, t.Null()])),
  aipdMotifPrecision: t.Optional(t.Union([t.String(), t.Null()])),
  aipdConclusion: t.Optional(t.Union([aipdConclusionSchema, t.Null()])),
  aipdConclusionDetail: t.Optional(t.Union([t.String(), t.Null()])),
  aipdDate: t.Optional(t.Union([dateIso, t.Null()])),
  aipdRevueDate: t.Optional(t.Union([dateIso, t.Null()])),
  notes: t.Optional(t.Union([t.String(), t.Null()])),
})
const rgpdExigenceItem = t.Object({
  exigenceRgpdId: t.String(),
  etat: t.Union([t.Literal('conforme'), t.Literal('non_conforme'), t.Literal('non_applicable')]),
  justification: t.Optional(t.Union([t.String(), t.Null()])),
})

const relationsSchema = t.Object({
  rgpd: t.Optional(t.Union([rgpdBloc, t.Null()])),
  rgpdExigences: t.Optional(t.Array(rgpdExigenceItem)),
  deploiements: t.Optional(t.Array(deploiementItem)),
  technologieIds: t.Optional(t.Array(t.String())),
  responsabilites: t.Optional(t.Array(responsabiliteItem)),
  prestataireIds: t.Optional(t.Array(t.String())),
  populationIds: t.Optional(t.Array(t.String())),
  groupeIds: t.Optional(t.Array(t.String())),
})
const createBody = t.Composite([coreBody, relationsSchema])
const patchBody = t.Composite([t.Partial(coreBody), relationsSchema])

type InsertApplication = typeof application.$inferInsert
type Relations = typeof relationsSchema.static

const applicationImport = makeImport(application, 'nom', IMPORT_REFERENCES.applications)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyDb = db as any

async function getRelations(appId: string) {
  const [deps, techs, resps, prests, pops, grps, rgpd, rgpdEx] = await Promise.all([
    db.select({ serveurId: deploiement.serveurId, role: deploiement.role, rolePrecision: deploiement.rolePrecision, environnement: deploiement.environnement })
      .from(deploiement).where(eq(deploiement.applicationId, appId)),
    db.select({ id: applicationTechnologie.technologieId }).from(applicationTechnologie).where(eq(applicationTechnologie.applicationId, appId)),
    db.select({ personneId: responsabilite.personneId, role: responsabilite.role }).from(responsabilite).where(eq(responsabilite.applicationId, appId)),
    db.select({ id: intervention.tiersId }).from(intervention).where(eq(intervention.applicationId, appId)),
    db.select({ id: applicationPopulation.populationId }).from(applicationPopulation).where(eq(applicationPopulation.applicationId, appId)),
    db.select({ id: applicationGroupe.groupeId }).from(applicationGroupe).where(eq(applicationGroupe.applicationId, appId)),
    db.select().from(applicationRgpd).where(eq(applicationRgpd.applicationId, appId)).limit(1),
    db.select({
      exigenceRgpdId: applicationExigenceRgpd.exigenceRgpdId,
      etat: applicationExigenceRgpd.etat,
      justification: applicationExigenceRgpd.justification,
    }).from(applicationExigenceRgpd).where(eq(applicationExigenceRgpd.applicationId, appId)),
  ])
  return {
    // Volet RGPD renvoyé avec les autres relations : le formulaire le préremplit et le
    // renvoie tel quel, sans appel séparé.
    rgpd: rgpd[0] ?? null,
    rgpdExigences: rgpdEx,
    deploiements: deps,
    technologieIds: techs.map(x => x.id),
    responsabilites: resps,
    prestataireIds: prests.map(x => x.id),
    populationIds: pops.map(x => x.id),
    groupeIds: grps.map(x => x.id),
  }
}

async function applyRelations(appId: string, r: Relations) {
  // Bloc d'analyse d'impact : créé à la première écriture, mis à jour ensuite.
  if (r.rgpd !== undefined && r.rgpd !== null) {
    const b = r.rgpd
    // Une conclusion n'a de sens que sur une analyse TERMINÉE : sur toute autre, on la
    // remet à zéro plutôt que de conserver un verdict qui n'a plus cours.
    const terminee = b.aipdStatut === 'terminee'
    const valeurs = {
      applicationId: appId,
      aipdStatut: b.aipdStatut,
      aipdMotif: b.aipdStatut === 'non_requise' ? null : b.aipdMotif || null,
      aipdMotifPrecision: b.aipdStatut === 'non_requise' ? null : (b.aipdMotifPrecision?.trim() || null),
      aipdConclusion: terminee ? b.aipdConclusion || null : null,
      aipdConclusionDetail: terminee ? (b.aipdConclusionDetail?.trim() || null) : null,
      aipdDate: b.aipdDate || null,
      aipdRevueDate: b.aipdRevueDate || null,
      notes: b.notes?.trim() || null,
    }
    await db.insert(applicationRgpd).values(valeurs)
      .onConflictDoUpdate({ target: applicationRgpd.applicationId, set: { ...valeurs, updatedAt: new Date() } })
  }
  if (r.rgpdExigences !== undefined) {
    // Remplacement intégral : une exigence ABSENTE de la charge utile redevient « non évaluée
    // ».
    await db.delete(applicationExigenceRgpd).where(eq(applicationExigenceRgpd.applicationId, appId))
    const vues = new Set<string>()
    const rows = r.rgpdExigences
      .filter(x => !vues.has(x.exigenceRgpdId) && vues.add(x.exigenceRgpdId))
      .map(x => ({
        applicationId: appId,
        exigenceRgpdId: x.exigenceRgpdId,
        etat: x.etat,
        justification: x.justification?.trim() || null,
      }))
    if (rows.length) await anyDb.insert(applicationExigenceRgpd).values(rows)
  }
  if (r.deploiements !== undefined) {
    await db.delete(deploiement).where(eq(deploiement.applicationId, appId))
    const rows = r.deploiements.map(d => ({ applicationId: appId, serveurId: d.serveurId, role: d.role, rolePrecision: d.rolePrecision ?? null, environnement: d.environnement ?? null }))
    if (rows.length) await anyDb.insert(deploiement).values(rows)
  }
  if (r.technologieIds !== undefined) {
    await db.delete(applicationTechnologie).where(eq(applicationTechnologie.applicationId, appId))
    const ids = [...new Set(r.technologieIds)]
    if (ids.length) await db.insert(applicationTechnologie).values(ids.map(id => ({ applicationId: appId, technologieId: id })))
  }
  if (r.responsabilites !== undefined) {
    await db.delete(responsabilite).where(eq(responsabilite.applicationId, appId))
    const seen = new Set<string>()
    const rows = r.responsabilites.filter(x => { const k = x.personneId + ':' + x.role; if (seen.has(k)) return false; seen.add(k); return true })
      .map(x => ({ applicationId: appId, personneId: x.personneId, role: x.role }))
    if (rows.length) await anyDb.insert(responsabilite).values(rows)
  }
  if (r.prestataireIds !== undefined) {
    await db.delete(intervention).where(eq(intervention.applicationId, appId))
    const ids = [...new Set(r.prestataireIds)]
    if (ids.length) await db.insert(intervention).values(ids.map(id => ({ applicationId: appId, tiersId: id })))
  }
  if (r.populationIds !== undefined) {
    await db.delete(applicationPopulation).where(eq(applicationPopulation.applicationId, appId))
    const ids = [...new Set(r.populationIds)]
    if (ids.length) await db.insert(applicationPopulation).values(ids.map(id => ({ applicationId: appId, populationId: id })))
  }
  if (r.groupeIds !== undefined) {
    await db.delete(applicationGroupe).where(eq(applicationGroupe.applicationId, appId))
    const ids = [...new Set(r.groupeIds)]
    if (ids.length) await db.insert(applicationGroupe).values(ids.map(id => ({ applicationId: appId, groupeId: id })))
  }
}

const splitBody = (body: typeof createBody.static | typeof patchBody.static) => {
  const { rgpd, rgpdExigences, deploiements, technologieIds, responsabilites, prestataireIds, populationIds, groupeIds, ...core } = body
  return { core, relations: { rgpd, rgpdExigences, deploiements, technologieIds, responsabilites, prestataireIds, populationIds, groupeIds } as Relations }
}

export const applicationsRouter = new Elysia({ name: 'applications', prefix: '/api/applications' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })
  // Actions groupées — monté AVANT les routes '/:id' ci-dessous, sinon « /lot » serait capturé
  // par le paramètre dynamique et le serveur chercherait une application dont l'identifiant
  // serait « lot ».
  .use(lotRoutes({ name: 'applications', prefix: '/api/applications', table: application }))
  .post('/import', applicationImport.handler, { can: { category: 'applications', level: 'write' }, body: applicationImport.bodySchema })
  // L'état RGPD est CALCULÉ à la lecture (voir selectionEtatRgpd) : une colonne stockée se
  // désynchroniserait dès l'ajout d'une exigence au référentiel, et une application marquée
  // conforme le resterait sans que personne n'ait répondu à la nouvelle question.
  .get('/', async ({ query, status }) => {
    // FILTRE SUR L'ÉTAT RGPD. Sur un catalogue paginé sans filtre, la seule réponse honnête
    // qu'elle puisse produire à « combien d'applications en écart ?
    if (query.etatRgpd !== undefined && !(ETATS_RGPD as readonly string[]).includes(query.etatRgpd)) {
      return status(422, `etatRgpd inconnu : « ${query.etatRgpd} ». Valeurs : ${ETATS_RGPD.join(', ')}.`)
    }
    // Le MÊME `where` sert à la page et au total : c'est ce qui rend « 4 applications en
    // écart » et « la première page des applications en écart » cohérents.
    const where = query.etatRgpd ? eq(expressionEtatRgpd(), query.etatRgpd) : undefined

    const base = db
      .select({ ...getTableColumns(application), ...selectionEtatRgpd() })
      .from(application)
      .where(where)
      .orderBy(desc(application.createdAt))

    if (!pagineDemandee(query)) return base

    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      // Compté par la base : le nombre de lignes rendues n'est jamais un décompte.
      db.select({ n: sql<number>`count(*)::int` }).from(application).where(where),
    ])
    return enveloppe(rows, compte?.n ?? 0, b)
  }, {
    can: { category: 'applications', level: 'read' },
    query: t.Object({ ...SCHEMA_PAGINATION, etatRgpd: t.Optional(t.String()) }),
    detail: {
      summary: 'Applications, avec leur état RGPD calculé à la lecture.',
      description: '`etatRgpd` filtre sur ' + ETATS_RGPD.join(' | ') + ' ; une valeur hors de cette liste '
        + 'est refusée en 422, jamais ignorée. Le filtre se compose avec `page`/`pageSize`, et le total '
        + 'porte alors sur le filtre, pas sur le catalogue. `non_evalue` n\'est PAS un écart : personne '
        + 'n\'a répondu, ce qui est du travail à faire et non un manquement. `hors_perimetre` n\'entre '
        + 'dans aucun des deux décomptes.',
    },
  })
  // RÉSUMÉ DES APPLICATIONS. Ce catalogue n'avait aucun résumé : « combien d'applications
  // exposées sur Internet », « combien en production », « combien traitent des données
  // personnelles » n'avaient de réponse qu'en listant et en comptant soi-même.
  .get('/resume', async () => {
    const [r] = await db.select({
      total: sql<number>`count(*)::int`,
      parStatut: { ...partitionAvecNul(application.statut, appStatut.enumValues, 'non_renseigne') },
      parExposition: { ...partitionAvecNul(application.exposition, appExposition.enumValues, 'non_renseignee') },
      parHebergement: { ...partitionAvecNul(application.hebergement, appHebergement.enumValues, 'non_renseigne') },
      parSensibilite: { ...partitionAvecNul(application.sensibilite, appSensibilite.enumValues, 'non_renseignee') },
      parCriticite: { ...partitionAvecNul(application.criticite, appCriticite.enumValues, 'non_renseignee') },
      // Trois états, et le troisième est le piège : `null` signifie que la question n'a
      // pas été tranchée, jamais que l'application ne traite pas de données personnelles.
      donneesPersonnelles: {
        oui: sql<number>`count(*) filter (where ${application.donneesPersonnelles} is true)::int`,
        non: sql<number>`count(*) filter (where ${application.donneesPersonnelles} is false)::int`,
        non_tranche: sql<number>`count(*) filter (where ${application.donneesPersonnelles} is null)::int`,
      },
    }).from(application)

    const [rgpd] = await db.select({
      ecart: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'ecart')::int`,
      conforme: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'conforme')::int`,
      non_evalue: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'non_evalue')::int`,
      hors_perimetre: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'hors_perimetre')::int`,
    }).from(application)

    // VENTILATION PAR PÔLE — le seul axe organisationnel que porte une application.
    const parPole = await ventiler(application, application.poleId, pole, pole.id, pole.nom, '/api/poles')

    return { ...r, parEtatRgpd: rgpd, parPole }
  }, {
    can: { category: 'applications', level: 'read' },
    detail: {
      summary: 'Applications : décomptes par statut, exposition, hébergement, sensibilité, criticité et état RGPD.',
      description: 'Chaque bloc `par…` est une PARTITION complète du vocabulaire correspondant, déclarée '
        + 'dans /api/lectures : la somme de ses valeurs fait `total`. `donneesPersonnelles.non_tranche` '
        + 'n\'est PAS `non` — la question n\'a pas été posée, et conclure à l\'absence de données '
        + 'personnelles sur cette valeur serait infondé.',
    },
  })

  .get(
    '/:id',
    async ({ params, status }) => {
      const [row] = await db.select().from(application).where(eq(application.id, params.id)).limit(1)
      if (!row) return status(404, 'Application introuvable')
      return { ...row, ...(await getRelations(row.id)) }
    },
    { can: { category: 'applications', level: 'read' }, params: t.Object({ id: t.String() }) },
  )
  .post(
    '/',
    async ({ body }) => {
      const { core, relations } = splitBody(body)
      const [row] = await db.insert(application).values(core as InsertApplication).returning()
      await applyRelations(row!.id, relations)
      return row!
    },
    { can: { category: 'applications', level: 'write' }, body: createBody },
  )
  .patch(
    '/:id',
    async ({ params, body, status, request }) => {
      const { core, relations } = splitBody(body)
      const [before] = await db.select().from(application).where(eq(application.id, params.id)).limit(1)
      // Relations incluses dans l'instantané : le journal ne peut détailler « ce qui a
      // changé » dans le volet RGPD ou les déploiements que s'il connaît l'état d'AVANT.
      if (before) beforeSnapshot.set(request, { ...before, ...(await getRelations(params.id)) })
      if (Object.keys(core).length) {
        const [row] = await db.update(application).set(core as Partial<InsertApplication>).where(eq(application.id, params.id)).returning()
        if (!row) return status(404, 'Application introuvable')
      }
      await applyRelations(params.id, relations)
      const [row] = await db.select().from(application).where(eq(application.id, params.id)).limit(1)
      if (!row) return status(404, 'Application introuvable')
      return { ...row, ...(await getRelations(params.id)) }
    },
    { can: { category: 'applications', level: 'write' }, params: t.Object({ id: t.String() }), body: patchBody },
  )
  .delete(
    '/:id',
    async ({ params, request }) => {
      // Nom capturé AVANT effacement : la notification doit dire quoi, pas un identifiant.
      const [before] = await db.select().from(application).where(eq(application.id, params.id)).limit(1)
      if (before) beforeSnapshot.set(request, before)
      await db.delete(application).where(eq(application.id, params.id))
      return { ok: true }
    },
    { can: { category: 'applications', level: 'write' }, params: t.Object({ id: t.String() }) },
  )
