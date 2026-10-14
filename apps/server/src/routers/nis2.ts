import { Elysia, t } from 'elysia'
import { asc, eq, sql } from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { db } from '@catalogue/database'
import {
  actionNis2,
  clauseIso27001,
  exigenceNis2,
  exigenceNis2Iso,
  exigenceNis2Mesure,
  exigenceNis2Responsable,
  mesureSmsi,
  objectifNis2,
  personne,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'

// Plan d'actions NIS 2 (référentiel ReCyF). L'exigence porte la conformité déclarée, l'action
// porte le travail concret.

const resp = alias(personne, 'action_resp')
const tech = alias(personne, 'action_tech')

// Nom affichable d'une personne, ou NULL si non renseignée (pas de chaîne vide).
const nomPersonne = (prenom: AnyPgColumn, nom: AnyPgColumn) =>
  sql<string | null>`nullif(trim(coalesce(${prenom}, '') || ' ' || coalesce(${nom}, '')), '')`

const AUJOURDHUI = () => new Date().toISOString().slice(0, 10)

const colonnes = {
  id: actionNis2.id,
  exigenceNis2Id: actionNis2.exigenceNis2Id,
  intitule: actionNis2.intitule,
  description: actionNis2.description,
  statut: actionNis2.statut,
  priorite: actionNis2.priorite,
  echeance: actionNis2.echeance,
  dateFait: actionNis2.dateFait,
  preuve: actionNis2.preuve,
  notes: actionNis2.notes,
  responsableId: actionNis2.responsableId,
  technicienId: actionNis2.technicienId,
  responsable: nomPersonne(resp.prenom, resp.nom),
  technicien: nomPersonne(tech.prenom, tech.nom),
  createdAt: actionNis2.createdAt,
  updatedAt: actionNis2.updatedAt,
}

export const nis2Router = new Elysia({ name: 'nis2-plan-actions' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Conformité'] } })

  // --- Actions d'une exigence ------------------------------------------------------
  .get('/api/exigences-nis2/:id/actions', async ({ params }) =>
    db
      .select(colonnes)
      .from(actionNis2)
      .leftJoin(resp, eq(resp.id, actionNis2.responsableId))
      .leftJoin(tech, eq(tech.id, actionNis2.technicienId))
      .where(eq(actionNis2.exigenceNis2Id, params.id))
      .orderBy(asc(actionNis2.statut), asc(actionNis2.echeance), asc(actionNis2.createdAt)),
  { can: { category: 'actions-nis2', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Création rapide depuis la fiche exigence (intitulé seul suffisant).
  .post('/api/exigences-nis2/:id/actions', async ({ params, body }) => {
    const [row] = await db
      .insert(actionNis2)
      .values({
        exigenceNis2Id: params.id,
        intitule: body.intitule.trim(),
        priorite: (body.priorite ?? 'moyenne') as never,
        echeance: body.echeance || null,
        responsableId: body.responsableId || null,
        technicienId: body.technicienId || null,
      })
      .returning()
    return row
  }, {
    can: { category: 'actions-nis2', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      intitule: t.String({ minLength: 1 }),
      priorite: t.Optional(t.String()),
      echeance: t.Optional(t.String()),
      responsableId: t.Optional(t.String()),
      technicienId: t.Optional(t.String()),
    }),
  })

  // --- Bascule de statut en un clic -------------------------------------------------
  // `dateFait` est la date de réalisation : posée au passage en « fait » (sauf si déjà
  // renseignée, pour ne pas écraser une date saisie à la main), retirée si on rouvre.
  .patch('/api/actions-nis2/:id/statut', async ({ params, body, status }) => {
    const [avant] = await db.select().from(actionNis2).where(eq(actionNis2.id, params.id)).limit(1)
    if (!avant) return status(404, { message: 'Action introuvable' })

    const fait = body.statut === 'fait'
    const [row] = await db
      .update(actionNis2)
      .set({
        statut: body.statut as never,
        dateFait: fait ? (avant.dateFait ?? AUJOURDHUI()) : null,
        updatedAt: new Date(),
      })
      .where(eq(actionNis2.id, params.id))
      .returning()
    return row
  }, {
    can: { category: 'actions-nis2', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ statut: t.Union([t.Literal('a_faire'), t.Literal('en_cours'), t.Literal('fait'), t.Literal('abandonnee')]) }),
  })

  // Bascule du niveau de conformité de l'exigence, sans passer par le formulaire complet.
  // Le statut suit la conformité pour rester cohérent (« fait » ⇒ statut « fait »).
  .patch('/api/exigences-nis2/:id/conformite', async ({ params, body, status }) => {
    const [avant] = await db.select().from(exigenceNis2).where(eq(exigenceNis2.id, params.id)).limit(1)
    if (!avant) return status(404, { message: 'Exigence introuvable' })

    const statutDeduit = body.conformite === 'fait'
      ? 'fait'
      : body.conformite === 'pas_du_tout' ? 'a_faire' : 'en_cours'
    const [row] = await db
      .update(exigenceNis2)
      .set({ conformite: body.conformite as never, statut: statutDeduit as never, updatedAt: new Date() })
      .where(eq(exigenceNis2.id, params.id))
      .returning()
    return row
  }, {
    can: { category: 'exigences-nis2', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ conformite: t.Union([t.Literal('fait'), t.Literal('partiellement'), t.Literal('tres_partiellement'), t.Literal('pas_du_tout')]) }),
  })

  // --- Responsables d'une exigence ---------------------------------------------------
  // Deux rôles distincts, comme demandé : « implementation » (portage organisationnel)
  // et « technique » (mise en place). Plusieurs personnes possibles pour chacun.
  .get('/api/exigences-nis2/:id/responsables', async ({ params }) =>
    db
      .select({
        id: exigenceNis2Responsable.id,
        personneId: exigenceNis2Responsable.personneId,
        role: exigenceNis2Responsable.role,
        nom: nomPersonne(personne.prenom, personne.nom),
      })
      .from(exigenceNis2Responsable)
      .innerJoin(personne, eq(personne.id, exigenceNis2Responsable.personneId))
      .where(eq(exigenceNis2Responsable.exigenceNis2Id, params.id))
      .orderBy(asc(exigenceNis2Responsable.role), asc(personne.nom)),
  { can: { category: 'exigences-nis2', level: 'read' }, params: t.Object({ id: t.String() }) })

  .post('/api/exigences-nis2/:id/responsables', async ({ params, body, status }) => {
    // L'unicité (exigence, personne, rôle) est garantie par l'index : on absorbe le
    // doublon plutôt que de renvoyer une erreur à l'utilisateur.
    const [row] = await db
      .insert(exigenceNis2Responsable)
      .values({ exigenceNis2Id: params.id, personneId: body.personneId, role: body.role as never })
      .onConflictDoNothing()
      .returning()
    return row ?? status(200, { deja: true as const })
  }, {
    can: { category: 'exigences-nis2', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      personneId: t.String(),
      role: t.Union([t.Literal('implementation'), t.Literal('technique')]),
    }),
  })

  .delete('/api/exigence-nis2-responsable/:id', async ({ params }) => {
    await db.delete(exigenceNis2Responsable).where(eq(exigenceNis2Responsable.id, params.id))
    return { ok: true as const }
  }, { can: { category: 'exigences-nis2', level: 'write' }, params: t.Object({ id: t.String() }) })

  // --- Correspondance officielle ANSSI vers l'ISO --------------------------------------
  // Renvois IMPORTÉS de la table de comparaison publiée par l'ANSSI, avec le niveau de
  // recouvrement et les observations.
  .get('/api/exigences-nis2/:id/iso', async ({ params, status }) => {
    const [exigence] = await db
      .select({ correspondanceIso: exigenceNis2.correspondanceIso, observationsIso: exigenceNis2.observationsIso })
      .from(exigenceNis2).where(eq(exigenceNis2.id, params.id)).limit(1)
    if (!exigence) return status(404, 'Exigence introuvable')

    const renvois = await db.select().from(exigenceNis2Iso)
      .where(eq(exigenceNis2Iso.exigenceNis2Id, params.id))
      .orderBy(asc(exigenceNis2Iso.ordre))
    const soa = new Map((await db.select({ id: mesureSmsi.id, reference: mesureSmsi.reference }).from(mesureSmsi)).map(m => [m.reference, m.id]))
    const clauses = new Map((await db.select({ id: clauseIso27001.id, reference: clauseIso27001.reference }).from(clauseIso27001)).map(c => [c.reference, c.id]))

    return {
      correspondance: exigence.correspondanceIso,
      observations: exigence.observationsIso,
      renvois: renvois.map(r => ({
        norme: r.norme,
        reference: r.reference,
        intitule: r.intitule,
        // Cible résolue : null si le référentiel visé n'est pas importé — la fiche le dit
        // alors plutôt que d'afficher un lien mort.
        cible: r.norme.startsWith('27002')
          ? (soa.has(`A.${r.reference}`) ? { type: 'soa' as const, id: soa.get(`A.${r.reference}`)! } : null)
          : (clauses.has(r.reference) ? { type: 'clause' as const, id: clauses.get(r.reference)! } : null),
      })),
    }
  }, { can: { category: 'exigences-nis2', level: 'read' }, params: t.Object({ id: t.String() }) })

  // --- Mapping vers les mesures ISO 27002 / SoA ---------------------------------------
  // L'ANSSI admet la certification 27001 comme moyen de démontrer la conformité : ce
  // mapping évite de traiter deux fois le même travail.
  .get('/api/exigences-nis2/:id/mesures', async ({ params }) =>
    db
      .select({
        id: exigenceNis2Mesure.id,
        mesureSmsiId: mesureSmsi.id,
        reference: mesureSmsi.reference,
        intitule: mesureSmsi.intitule,
      })
      .from(exigenceNis2Mesure)
      .innerJoin(mesureSmsi, eq(mesureSmsi.id, exigenceNis2Mesure.mesureSmsiId))
      .where(eq(exigenceNis2Mesure.exigenceNis2Id, params.id))
      .orderBy(asc(mesureSmsi.reference)),
  { can: { category: 'exigences-nis2', level: 'read' }, params: t.Object({ id: t.String() }) })

  .post('/api/exigences-nis2/:id/mesures', async ({ params, body, status }) => {
    const [row] = await db
      .insert(exigenceNis2Mesure)
      .values({ exigenceNis2Id: params.id, mesureSmsiId: body.mesureSmsiId })
      .onConflictDoNothing()
      .returning()
    return row ?? status(200, { deja: true as const })
  }, {
    can: { category: 'exigences-nis2', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ mesureSmsiId: t.String() }),
  })

  .delete('/api/exigence-nis2-mesure/:id', async ({ params }) => {
    await db.delete(exigenceNis2Mesure).where(eq(exigenceNis2Mesure.id, params.id))
    return { ok: true as const }
  }, { can: { category: 'exigences-nis2', level: 'write' }, params: t.Object({ id: t.String() }) })

  // --- Vue d'ensemble du plan --------------------------------------------------------
  // Toutes les actions, enrichies de leur exigence et de l'objectif de sécurité, pour
  // permettre le filtrage par domaine sans requête supplémentaire côté client.
  .get('/api/plan-actions-nis2', async ({ query }) => {
    const base = db
      .select({
        ...colonnes,
        reference: exigenceNis2.reference,
        exigence: exigenceNis2.intitule,
        objectifNumero: objectifNis2.numero,
        objectif: objectifNis2.intitule,
        domaine: objectifNis2.domaine,
      })
      .from(actionNis2)
      .innerJoin(exigenceNis2, eq(exigenceNis2.id, actionNis2.exigenceNis2Id))
      .leftJoin(objectifNis2, eq(objectifNis2.id, exigenceNis2.objectifNis2Id))
      .leftJoin(resp, eq(resp.id, actionNis2.responsableId))
      .leftJoin(tech, eq(tech.id, actionNis2.technicienId))
      .orderBy(asc(objectifNis2.numero), asc(exigenceNis2.reference), asc(actionNis2.createdAt))

    if (!pagineDemandee(query)) return base
    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      db.select({ n: sql<number>`count(*)::int` }).from(actionNis2),
    ])
    return enveloppe(rows, compte?.n ?? 0, b)
  }, { can: { category: 'actions-nis2', level: 'read' }, query: t.Object({ ...SCHEMA_PAGINATION }) })

  // Avancement global : sert l'en-tête du plan d'actions et le tableau de bord.
  .get('/api/nis2/avancement', async () => {
    const [exigences] = await db
      .select({
        total: sql<number>`count(*)::int`,
        fait: sql<number>`count(*) filter (where ${exigenceNis2.conformite} = 'fait')::int`,
        partiellement: sql<number>`count(*) filter (where ${exigenceNis2.conformite} = 'partiellement')::int`,
        tresPartiellement: sql<number>`count(*) filter (where ${exigenceNis2.conformite} = 'tres_partiellement')::int`,
        pasDuTout: sql<number>`count(*) filter (where ${exigenceNis2.conformite} = 'pas_du_tout')::int`,
        nonEvaluees: sql<number>`count(*) filter (where ${exigenceNis2.conformite} is null)::int`,
        nonApplicables: sql<number>`count(*) filter (where ${exigenceNis2.statut} = 'non_applicable')::int`,
      })
      .from(exigenceNis2)

    const [actions] = await db
      .select({
        total: sql<number>`count(*)::int`,
        aFaire: sql<number>`count(*) filter (where ${actionNis2.statut} = 'a_faire')::int`,
        enCours: sql<number>`count(*) filter (where ${actionNis2.statut} = 'en_cours')::int`,
        fait: sql<number>`count(*) filter (where ${actionNis2.statut} = 'fait')::int`,
        abandonnee: sql<number>`count(*) filter (where ${actionNis2.statut} = 'abandonnee')::int`,
        enRetard: sql<number>`count(*) filter (where ${actionNis2.statut} in ('a_faire','en_cours') and ${actionNis2.echeance} < current_date)::int`,
      })
      .from(actionNis2)

    return { exigences, actions }
  }, { can: { category: 'exigences-nis2', level: 'read' } })
