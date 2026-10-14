import { Elysia, t } from 'elysia'
import { eq, desc, sql } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-typebox'
import { db } from '@catalogue/database'
import { tiers, contact, tiersReferent, personne } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { lotRoutes } from './lot'
import { makeImport } from './importHelper'
import { beforeSnapshot } from '../utils/audit'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'

// Fiche prestataire/tiers : contacts externes + référents internes gérés en ligne.
// Règle métier : un prestataire (type prestataire_*) exige ≥ 1 contact ET ≥ 1 référent.
const insertTiers = createInsertSchema(tiers)
const coreBody = t.Omit(insertTiers, ['id', 'createdAt', 'updatedAt'])
const contactItem = t.Object({
  nom: t.String(),
  email: t.Optional(t.String()),
  telephone: t.Optional(t.String()),
  fonction: t.Optional(t.String()),
  principal: t.Optional(t.Boolean()),
})
const referentItem = t.Object({
  personneId: t.String(),
  role: t.Optional(t.String()),
  principal: t.Optional(t.Boolean()),
})
const relations = t.Object({
  contacts: t.Optional(t.Array(contactItem)),
  referents: t.Optional(t.Array(referentItem)),
})
const createBody = t.Composite([coreBody, relations])
const patchBody = t.Composite([t.Partial(coreBody), relations])

type InsertTiers = typeof tiers.$inferInsert
type ContactInput = typeof contactItem.static
type ReferentInput = typeof referentItem.static

const tiersImport = makeImport(tiers, 'nom')
const isPrestataire = (type?: string | null) =>
  type === 'prestataire_it' || type === 'prestataire_non_it'

const contactsOf = (id: string) => db.select().from(contact).where(eq(contact.tiersId, id))
const referentsOf = (id: string) =>
  db
    .select({
      id: tiersReferent.id,
      personneId: tiersReferent.personneId,
      role: tiersReferent.role,
      principal: tiersReferent.principal,
      nom: personne.nom,
      prenom: personne.prenom,
    })
    .from(tiersReferent)
    .innerJoin(personne, eq(tiersReferent.personneId, personne.id))
    .where(eq(tiersReferent.tiersId, id))

async function setContacts(tiersId: string, items: ContactInput[]) {
  await db.delete(contact).where(eq(contact.tiersId, tiersId))
  if (items.length) {
    await db.insert(contact).values(items.map(c => ({ ...c, tiersId })) as (typeof contact.$inferInsert)[])
  }
}
async function setReferents(tiersId: string, items: ReferentInput[]) {
  await db.delete(tiersReferent).where(eq(tiersReferent.tiersId, tiersId))
  if (items.length) {
    await db.insert(tiersReferent).values(items.map(r => ({ ...r, tiersId })) as (typeof tiersReferent.$inferInsert)[])
  }
}

export const tiersRouter = new Elysia({ name: 'tiers', prefix: '/api/tiers' })
  .use(betterAuth)
  // Actions groupées — voir applications.ts : montage AVANT toute route '/:id'.
  .use(lotRoutes({ name: 'tiers', prefix: '/api/tiers', table: tiers }))
  .post('/import', tiersImport.handler, { can: { category: 'tiers', level: 'write' }, body: tiersImport.bodySchema })
  // Sans `page` ni `pageSize`, le tableau complet est rendu comme auparavant.
  .get('/', async ({ query }) => {
    const base = db.select().from(tiers).orderBy(desc(tiers.createdAt))
    if (!pagineDemandee(query)) return base

    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      db.select({ n: sql<number>`count(*)::int` }).from(tiers),
    ])
    return enveloppe(rows, compte?.n ?? 0, b)
  }, {
    can: { category: 'tiers', level: 'read' },
    query: t.Object({ ...SCHEMA_PAGINATION }),
  })
  .get(
    '/:id',
    async ({ params, status }) => {
      const [row] = await db.select().from(tiers).where(eq(tiers.id, params.id)).limit(1)
      if (!row) return status(404, 'Tiers introuvable')
      return { ...row, contacts: await contactsOf(row.id), referents: await referentsOf(row.id) }
    },
    { can: { category: 'tiers', level: 'read' }, params: t.Object({ id: t.String() }) },
  )
  .post(
    '/',
    async ({ body, status }) => {
      const { contacts = [], referents = [], ...core } = body
      if (isPrestataire(core.type) && (contacts.length < 1 || referents.length < 1)) {
        return status(422, 'Un prestataire nécessite au moins un contact et un référent interne.')
      }
      const [row] = await db.insert(tiers).values(core as InsertTiers).returning()
      await setContacts(row!.id, contacts)
      await setReferents(row!.id, referents)
      return { ...row!, contacts, referents }
    },
    { can: { category: 'tiers', level: 'write' }, body: createBody },
  )
  .patch(
    '/:id',
    async ({ params, body, status, request }) => {
      const { contacts, referents, ...core } = body
      const [existing] = await db.select().from(tiers).where(eq(tiers.id, params.id)).limit(1)
      if (!existing) return status(404, 'Tiers introuvable')
      beforeSnapshot.set(request, existing)

      const finalType = core.type ?? existing.type
      const finalContacts = contacts ?? (await contactsOf(params.id))
      const finalReferents = referents ?? (await referentsOf(params.id))
      if (isPrestataire(finalType) && (finalContacts.length < 1 || finalReferents.length < 1)) {
        return status(422, 'Un prestataire nécessite au moins un contact et un référent interne.')
      }

      if (Object.keys(core).length) {
        await db.update(tiers).set(core as Partial<InsertTiers>).where(eq(tiers.id, params.id))
      }
      if (contacts) await setContacts(params.id, contacts)
      if (referents) await setReferents(params.id, referents)

      const [row] = await db.select().from(tiers).where(eq(tiers.id, params.id)).limit(1)
      return { ...row!, contacts: await contactsOf(params.id), referents: await referentsOf(params.id) }
    },
    { can: { category: 'tiers', level: 'write' }, params: t.Object({ id: t.String() }), body: patchBody },
  )
  .delete(
    '/:id',
    async ({ params }) => {
      await db.delete(tiers).where(eq(tiers.id, params.id))
      return { ok: true }
    },
    { can: { category: 'tiers', level: 'write' }, params: t.Object({ id: t.String() }) },
  )
