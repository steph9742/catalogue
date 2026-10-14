import { Elysia, t } from 'elysia'
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  actifInformationnel,
  appareilMobile,
  composante,
  composanteReferent,
  departement,
  entite,
  equipementReseau,
  glpiMachine,
  iot,
  lieu,
  machineIndus,
  personne,
  posteTravail,
  service,
  serveur,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { readableCategories, accesDe } from '../utils/access'

// Vue TRANSVERSE par périmètre : « qu'est-ce que j'ai à l'IUT NFC ? ».

const LIMITE = 50 // échantillon par type — au-delà, on renvoie le compte seul

// Compte les lignes d'une table par composante : « composanteId → nombre ».
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function comptesParComposante(colonne: never, table: any): Promise<Map<string, number>> {
  const rows = await db
    .select({ cid: colonne, n: sql<number>`count(*)::int` })
    .from(table)
    .where(isNotNull(colonne))
    .groupBy(colonne)
  return new Map(rows.map(r => [String(r.cid), Number(r.n)]))
}

export const composantesRouter = new Elysia({ name: 'composantes-perimetre' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })
  .get('/api/composantes/:id/perimetre', async ({ params, status, ...ctx }) => {
    const [c] = await db
      .select({
        id: composante.id,
        nom: composante.nom,
        sigle: composante.sigle,
        type: composante.type,
        entite: entite.nom,
      })
      .from(composante)
      .leftJoin(entite, eq(entite.id, composante.entiteId))
      .where(eq(composante.id, params.id))
      .limit(1)
    if (!c) return status(404, { message: 'Composante introuvable' })

    // Utilisateur OU compte de service : voir `accesDe`.
    const user = accesDe(ctx)
    const cats = await readableCategories(user)

    // Chaque bloc : compte total + échantillon, uniquement si la catégorie est lisible.
    const bloc = async (
      cat: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table: any,
      colId: never,
      colNom: never,
      colComposante: never,
    ) => {
      if (!cats.has(cat)) return null
      const compte = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(colComposante, params.id))
      const n = Number(compte[0]?.n ?? 0)
      const items = n
        ? await db.select({ id: colId, nom: colNom }).from(table).where(eq(colComposante, params.id)).orderBy(asc(colNom)).limit(LIMITE)
        : []
      return { total: Number(n), items: items as { id: string, nom: string }[] }
    }

    const [serveurs, postes, mobiles, objets, machines, lieux, reseaux, actifs] = await Promise.all([
      bloc('serveurs', serveur, serveur.id as never, serveur.hostname as never, serveur.composanteId as never),
      bloc('postes-travail', posteTravail, posteTravail.id as never, posteTravail.nom as never, posteTravail.composanteId as never),
      bloc('appareils-mobiles', appareilMobile, appareilMobile.id as never, appareilMobile.nom as never, appareilMobile.composanteId as never),
      bloc('iot', iot, iot.id as never, iot.nom as never, iot.composanteId as never),
      bloc('machines-indus', machineIndus, machineIndus.id as never, machineIndus.nom as never, machineIndus.composanteId as never),
      bloc('lieux', lieu, lieu.id as never, lieu.nom as never, lieu.composanteId as never),
      bloc('equipements-reseau', equipementReseau, equipementReseau.id as never, equipementReseau.nom as never, equipementReseau.composanteId as never),
      bloc('actifs-informationnels', actifInformationnel, actifInformationnel.id as never, actifInformationnel.nom as never, actifInformationnel.composanteId as never),
    ])

    const blocs = [
      { cle: 'serveurs', label: 'Serveurs', icon: 'lucide:server', base: '/serveurs', data: serveurs },
      { cle: 'postes-travail', label: 'Postes de travail', icon: 'lucide:monitor', base: '/postes-travail', data: postes },
      { cle: 'appareils-mobiles', label: 'Appareils mobiles', icon: 'lucide:tablet-smartphone', base: '/appareils-mobiles', data: mobiles },
      { cle: 'iot', label: 'IoT & objets connectés', icon: 'lucide:cctv', base: '/iot', data: objets },
      { cle: 'machines-indus', label: 'Machines industrielles', icon: 'lucide:factory', base: '/machines-indus', data: machines },
      { cle: 'equipements-reseau', label: 'Équipements réseau', icon: 'lucide:router', base: '/equipements-reseau', data: reseaux },
      { cle: 'lieux', label: 'Lieux', icon: 'lucide:map-pin', base: '/lieux', data: lieux },
      { cle: 'actifs-informationnels', label: 'Actifs informationnels', icon: 'lucide:database', base: '/actifs-informationnels', data: actifs },
    ].filter(b => b.data !== null)

    const total = blocs.reduce((s, b) => s + (b.data?.total ?? 0), 0)

    // --- Posture DU PÉRIMÈTRE ---------------------------------------------------------
    // Même lecture que la posture globale du tableau de bord, restreinte à la composante :
    // les deux coexistent (vision RSSI d'un côté, vision périmètre de l'autre).
    const [aClasser] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(glpiMachine)
      .where(and(eq(glpiMachine.classement, 'a_classer'), sql`${glpiMachine.entite} ilike ${'%' + (c.nom ?? '') + '%'}`))

    // Systèmes en fin de support dans ce périmètre : signal d'obsolescence le plus concret
    // (Windows 7/8/10, Server 2008/2012/2016, CentOS…).
    const OBSOLETES = '(os ilike \'%windows 7%\' or os ilike \'%windows 8%\' or os ilike \'%windows xp%\' or os ilike \'%server 2008%\' or os ilike \'%server 2012%\' or os ilike \'%centos%\')'
    const [obsoServeurs] = await db.select({ n: sql<number>`count(*)::int` }).from(serveur)
      .where(and(eq(serveur.composanteId, params.id), sql.raw(OBSOLETES)))
    const [obsoPostes] = await db.select({ n: sql<number>`count(*)::int` }).from(posteTravail)
      .where(and(eq(posteTravail.composanteId, params.id), sql.raw(OBSOLETES)))

    const [horsGlpi] = await db.select({ n: sql<number>`count(*)::int` }).from(serveur)
      .where(and(eq(serveur.composanteId, params.id), eq(serveur.sourceGlpi, false)))

    const posture = {
      aClasser: Number(aClasser?.n ?? 0),
      obsoletes: Number(obsoServeurs?.n ?? 0) + Number(obsoPostes?.n ?? 0),
      serveursHorsGlpi: Number(horsGlpi?.n ?? 0),
    }

    return { composante: c, blocs, total, limite: LIMITE, posture }
  }, {
    auth: ['user', 'admin', 'svc'],
    params: t.Object({ id: t.String() }),
  })

  // Index des composantes avec leur volumétrie : sert de page d'entrée « par périmètre ».
  .get('/api/composantes-volumetrie', async () => {
    const [lignes, srv, pst, mob, obj] = await Promise.all([
      db.select({ id: composante.id, nom: composante.nom, sigle: composante.sigle, type: composante.type })
        .from(composante).orderBy(asc(composante.nom)),
      comptesParComposante(serveur.composanteId as never, serveur),
      comptesParComposante(posteTravail.composanteId as never, posteTravail),
      comptesParComposante(appareilMobile.composanteId as never, appareilMobile),
      comptesParComposante(iot.composanteId as never, iot),
    ])
    return lignes.map(l => ({
      ...l,
      serveurs: srv.get(l.id) ?? 0,
      postes: pst.get(l.id) ?? 0,
      mobiles: mob.get(l.id) ?? 0,
      iot: obj.get(l.id) ?? 0,
    }))
  }, { can: { category: 'composantes', level: 'read' } })

  // --- Référents cyber de la composante ------------------------------------------------
  // « informaticien de proximité » (plusieurs) et « CSSI » (le correspondant sécurité).
  .get('/api/composantes/:id/referents', async ({ params }) =>
    db
      .select({
        id: composanteReferent.id,
        personneId: personne.id,
        role: composanteReferent.role,
        nom: sql<string>`nullif(trim(coalesce(${personne.prenom}, '') || ' ' || coalesce(${personne.nom}, '')), '')`,
        email: personne.email,
      })
      .from(composanteReferent)
      .innerJoin(personne, eq(personne.id, composanteReferent.personneId))
      .where(eq(composanteReferent.composanteId, params.id))
      .orderBy(asc(composanteReferent.role), asc(personne.nom)),
  { can: { category: 'composantes', level: 'read' }, params: t.Object({ id: t.String() }) })

  .post('/api/composantes/:id/referents', async ({ params, body, status }) => {
    // L'unicité (composante, personne, rôle) est garantie par index : on absorbe le
    // doublon au lieu de renvoyer une erreur à l'utilisateur.
    const cree = await db
      .insert(composanteReferent)
      .values({ composanteId: params.id, personneId: body.personneId, role: body.role as never })
      .onConflictDoNothing()
      .returning()
    return cree[0] ?? status(200, { deja: true as const })
  }, {
    can: { category: 'composantes', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      personneId: t.String(),
      role: t.Union([t.Literal('informaticien_proximite'), t.Literal('cssi')]),
    }),
  })

  .delete('/api/composante-referent/:id', async ({ params }) => {
    await db.delete(composanteReferent).where(eq(composanteReferent.id, params.id))
    return { ok: true as const }
  }, { can: { category: 'composantes', level: 'write' }, params: t.Object({ id: t.String() }) })

  // --- Fusion de deux composantes -------------------------------------------------------
  // Tout ce qui pointe vers la SOURCE est réaffecté à la CIBLE, puis la source est supprimée.
  .post('/api/composantes/:id/fusionner', async ({ params, body, status }) => {
    const cibleId = params.id
    const sourceId = body.sourceId
    if (cibleId === sourceId) return status(422, { message: 'Une composante ne peut pas être fusionnée avec elle-même.' })

    const [cible, source] = await Promise.all([
      db.select({ id: composante.id, nom: composante.nom }).from(composante).where(eq(composante.id, cibleId)).limit(1),
      db.select({ id: composante.id, nom: composante.nom }).from(composante).where(eq(composante.id, sourceId)).limit(1),
    ])
    if (!cible[0] || !source[0]) return status(404, { message: 'Composante introuvable.' })

    const deplaces: Record<string, number> = {}
    await db.transaction(async (tx) => {
      // Actifs et emplacements (FK nullable) : simple réaffectation.
      const tables = [
        ['serveurs', serveur, serveur.composanteId],
        ['postes', posteTravail, posteTravail.composanteId],
        ['mobiles', appareilMobile, appareilMobile.composanteId],
        ['iot', iot, iot.composanteId],
        ['machines-indus', machineIndus, machineIndus.composanteId],
        ['equipements-reseau', equipementReseau, equipementReseau.composanteId],
        ['lieux', lieu, lieu.composanteId],
        ['actifs-informationnels', actifInformationnel, actifInformationnel.composanteId],
        // Unités rattachées (FK non nulle) : elles suivent aussi.
        ['services', service, service.composanteId],
        ['departements', departement, departement.composanteId],
        ['referents', composanteReferent, composanteReferent.composanteId],
      ] as const
      for (const [cle, table, colonne] of tables) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maj = await tx.update(table as any).set({ composanteId: cibleId }).where(eq(colonne as never, sourceId)).returning({ id: sql<string>`1` })
        deplaces[cle] = maj.length
      }
      await tx.delete(composante).where(eq(composante.id, sourceId))
    })

    return { ok: true as const, cible: cible[0].nom, source: source[0].nom, deplaces }
  }, {
    can: { category: 'composantes', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ sourceId: t.String() }),
  })
