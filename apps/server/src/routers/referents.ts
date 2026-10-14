import { Elysia, t } from 'elysia'
import { eq, or, asc } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { personneReferent, personne, composante, service, population, entite, entiteResponsable, departement, pole } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { SCHEMA_PAGINATION, paginerEnMemoire } from '../utils/pagination'

// Titres portés par une personne : « référent de … » (kind=referent) ou rôle/mission
// (kind=mission). RBAC rattaché à la catégorie « personnes ».
export const referentsRouter = new Elysia({ name: 'referents' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })

  // Titres groupés (par titre), avec leurs personnes. Filtre optionnel ?kind=referent|mission.
  .get('/api/referents', async ({ query }) => {
    const where = query.kind === 'referent' || query.kind === 'mission'
      ? eq(personneReferent.kind, query.kind)
      : undefined
    const rows = await db
      .select({
        titre: personneReferent.titre,
        kind: personneReferent.kind,
        personneId: personne.id,
        nom: personne.nom,
        prenom: personne.prenom,
      })
      .from(personneReferent)
      .leftJoin(personne, eq(personneReferent.personneId, personne.id))
      .where(where)
      .orderBy(asc(personneReferent.titre), asc(personne.nom))

    const map = new Map<string, { titre: string, kind: string, personnes: { id: string, nom: string, prenom: string | null }[] }>()
    for (const r of rows) {
      const key = `${r.kind}::${r.titre}`
      const g = map.get(key) ?? { titre: r.titre, kind: r.kind, personnes: [] }
      if (r.personneId) g.personnes.push({ id: r.personneId, nom: r.nom ?? '', prenom: r.prenom })
      map.set(key, g)
    }
    return [...map.values()]
  }, { can: { category: 'personnes', level: 'read' }, query: t.Object({ kind: t.Optional(t.String()) }) })

  // Annuaire « qui fait quoi » : personnes enrichies (composante, service) + titres.
  .get('/api/annuaire', async ({ query }) => {
    const [persons, titres] = await Promise.all([
      db.select({
        id: personne.id, nom: personne.nom, prenom: personne.prenom, fonction: personne.fonction,
        email: personne.email, actif: personne.actif,
        populationId: personne.populationId, populationNom: population.nom,
        composanteId: personne.composanteId, composanteNom: composante.nom,
        serviceId: personne.serviceId, serviceNom: service.nom,
      })
        .from(personne)
        .leftJoin(population, eq(personne.populationId, population.id))
        .leftJoin(composante, eq(personne.composanteId, composante.id))
        .leftJoin(service, eq(personne.serviceId, service.id))
        .orderBy(asc(personne.nom), asc(personne.prenom)),
      db.select({ personneId: personneReferent.personneId, titre: personneReferent.titre, kind: personneReferent.kind }).from(personneReferent),
    ])
    const byPers = new Map<string, { referents: string[], missions: string[] }>()
    for (const t of titres) {
      const g = byPers.get(t.personneId) ?? { referents: [], missions: [] }
      ;(t.kind === 'mission' ? g.missions : g.referents).push(t.titre)
      byPers.set(t.personneId, g)
    }
    // Pagination EN MÉMOIRE : la liste est composée à partir de deux requêtes, et les titres
    // sont rattachés après coup.
    return paginerEnMemoire(query, persons.map(p => ({ ...p, ...(byPers.get(p.id) ?? { referents: [], missions: [] }) })))
  }, {
    can: { category: 'personnes', level: 'read' },
    query: t.Object({ ...SCHEMA_PAGINATION }),
    detail: {
      description: 'L\'annuaire complet. `page`/`pageSize` rendent `{ rows, total, page, pageSize }` ; '
        + 'sans eux, le tableau complet.',
    },
  })

  // Responsabilités d'une personne à travers l'organisation (gouvernance, directions…).
  .get('/api/personnes/:id/roles', async ({ params }) => {
    const pid = params.id
    const gov: Record<string, string> = { president: 'Président·e', vice_president: 'Vice-président·e', chef_cabinet: 'Chef·fe de cabinet', secretaire_cabinet: 'Secrétaire de cabinet', dgs: 'DGS', dga: 'DGA' }
    const out: { role: string, unitType: string, unitId: string, unitNom: string }[] = []

    const govRows = await db.select({ role: entiteResponsable.role, id: entite.id, nom: entite.nom, sigle: entite.sigle })
      .from(entiteResponsable).leftJoin(entite, eq(entiteResponsable.entiteId, entite.id))
      .where(eq(entiteResponsable.personneId, pid))
    for (const g of govRows) out.push({ role: gov[g.role] ?? g.role, unitType: 'entites', unitId: g.id ?? '', unitNom: g.sigle || g.nom || '' })

    const comps = await db.select({ id: composante.id, nom: composante.nom, sigle: composante.sigle, dir: composante.directeurId, vdir: composante.viceDirecteurId, rsa: composante.rsaId })
      .from(composante).where(or(eq(composante.directeurId, pid), eq(composante.viceDirecteurId, pid), eq(composante.rsaId, pid)))
    for (const c of comps) {
      const n = c.sigle || c.nom || ''
      if (c.dir === pid) out.push({ role: 'Directeur·rice', unitType: 'composantes', unitId: c.id, unitNom: n })
      if (c.vdir === pid) out.push({ role: 'Vice-directeur·rice', unitType: 'composantes', unitId: c.id, unitNom: n })
      if (c.rsa === pid) out.push({ role: 'RSA', unitType: 'composantes', unitId: c.id, unitNom: n })
    }

    const deps = await db.select({ id: departement.id, nom: departement.nom, dir: departement.directeurId, sec: departement.secretaireId })
      .from(departement).where(or(eq(departement.directeurId, pid), eq(departement.secretaireId, pid)))
    for (const d of deps) {
      if (d.dir === pid) out.push({ role: 'Directeur·rice', unitType: 'departements', unitId: d.id, unitNom: d.nom ?? '' })
      if (d.sec === pid) out.push({ role: 'Secrétaire', unitType: 'departements', unitId: d.id, unitNom: d.nom ?? '' })
    }

    const svcs = await db.select({ id: service.id, nom: service.nom }).from(service).where(eq(service.directeurId, pid))
    for (const s of svcs) out.push({ role: 'Directeur·rice', unitType: 'services', unitId: s.id, unitNom: s.nom ?? '' })

    const pls = await db.select({ id: pole.id, nom: pole.nom }).from(pole).where(eq(pole.responsableId, pid))
    for (const p of pls) out.push({ role: 'Responsable', unitType: 'poles', unitId: p.id, unitNom: p.nom ?? '' })

    return out
  }, { can: { category: 'personnes', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Titres d'une personne.
  .get('/api/personnes/:id/referents', async ({ params }) =>
    db.select({ id: personneReferent.id, titre: personneReferent.titre, kind: personneReferent.kind })
      .from(personneReferent)
      .where(eq(personneReferent.personneId, params.id))
      .orderBy(asc(personneReferent.titre)),
  { can: { category: 'personnes', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Ajout d'un titre (idempotent sur (personne, titre, kind)).
  .post('/api/personnes/:id/referents', async ({ params, body }) => {
    const titre = body.titre.trim()
    if (!titre) return { ok: false as const }
    const kind = body.kind === 'mission' ? 'mission' : 'referent'
    await db.insert(personneReferent)
      .values({ personneId: params.id, titre, kind })
      .onConflictDoNothing()
    return { ok: true as const }
  }, {
    can: { category: 'personnes', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ titre: t.String(), kind: t.Optional(t.String()) }),
  })

  // Suppression d'un titre.
  .delete('/api/referents/:refId', async ({ params }) => {
    await db.delete(personneReferent).where(eq(personneReferent.id, params.refId))
    return { ok: true as const }
  }, { can: { category: 'personnes', level: 'write' }, params: t.Object({ refId: t.String() }) })
