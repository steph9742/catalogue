import { Elysia, t } from 'elysia'
import { and, eq, getTableColumns, inArray, lt, or, sql, type Column } from 'drizzle-orm'
import { type PgTable } from 'drizzle-orm/pg-core'
import { db } from '@catalogue/database'
import { annulationLot, pieceJointe } from '@catalogue/database/tables'

// ACTIONS GROUPÉES — greffon réutilisable, monté par le routeur CRUD générique ET par les
// routeurs dédiés (applications, tiers…). ATTENTION À L'ORDRE DE MONTAGE : ce greffon doit être
// appliqué AVANT toute route « /:id ».

export function lotRoutes<T extends PgTable>(config: {
  name: string
  prefix: string
  table: T
  category?: string
}) {
  const { name, prefix, table } = config
  const category = config.category ?? name
  const read = { can: { category, level: 'read' as const } }
  const write = { can: { category, level: 'write' as const } }
  const doc = (summary: string, description: string) => ({
    detail: { tags: ['Actions groupées'], summary, description },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const idCol = (table as never as { id: never }).id

  /**
   * Conserve l'état antérieur d\'une action groupée et renvoie sa référence.
   */
  const deposerAnnulation = async (type: 'modification' | 'suppression', contenu: unknown) => {
    await db.delete(annulationLot).where(lt(annulationLot.creeLe, new Date(Date.now() - 24 * 3600 * 1000)))
    const [row] = await db.insert(annulationLot).values({
      endpoint: prefix,
      type,
      contenu: contenu as never,
      lignes: String(Array.isArray(contenu) ? contenu.length : 0),
    }).returning({ id: annulationLot.id })
    return row?.id ?? null
  }

  /**
   * Reconstitue les types que le passage par JSON a aplatis. Le point d'annulation est stocké
   * en jsonb : les dates y deviennent des chaînes ISO.
   */
  const retyper = (ligne: Record<string, unknown>) => {
    const cols = getTableColumns(table) as Record<string, Column>
    const sortie: Record<string, unknown> = {}
    for (const [cle, valeur] of Object.entries(ligne)) {
      const col = cols[cle]
      sortie[cle] = col?.dataType === 'date' && typeof valeur === 'string'
        ? new Date(valeur)
        : valeur
    }
    return sortie
  }

  // Critères identiques à ceux de la liste : « tous les résultats du filtre » porte donc
  // EXACTEMENT sur ce que l'utilisateur voit filtré, jamais sur autre chose.
  const critereDe = (query: Record<string, unknown>) => {
    const cols = getTableColumns(table) as Record<string, Column>
    const reserved = new Set(['page', 'pageSize', 'q', 'sort', 'dir'])
    const conds = []

    const term = String(query.q ?? '').trim()
    if (term) {
      const textCols = Object.values(cols).filter(c => c.dataType === 'string')
      const like = `%${term}%`
      const ors = textCols.map(c => sql`cast(${c} as text) ilike ${like}`)
      if (ors.length) conds.push(or(...ors))
    }
    for (const [k, raw] of Object.entries(query)) {
      if (reserved.has(k) || raw == null || !cols[k]) continue
      const col = cols[k]!
      const values = String(raw).split(',').map((v) => {
        if (col.dataType === 'boolean') return v === 'true' || v === '1'
        if (col.dataType === 'number') return Number(v)
        return v
      })
      conds.push(inArray(col, values as never[]))
    }
    return conds.length ? and(...conds) : undefined
  }

  return new Elysia({ name: `${name}-lot` })
  // ATTENTION À L'ORDRE : ces routes doivent précéder toutes les routes '/:id'.
  .patch(
    '/lot',
    async ({ body: input, status }) => {
      const { ids, filtre, valeurs } = input as {
        ids?: string[]
        filtre?: Record<string, string>
        valeurs: Record<string, unknown>
      }
      if (!Object.keys(valeurs ?? {}).length) return status(422, { message: 'Aucune modification demandée.' })
      const cible = ids?.length ? inArray(idCol, ids) : (filtre ? critereDe(filtre) : undefined)
      if (!cible) return status(422, { message: 'Aucune ligne désignée.' })

      // Photo AVANT, restreinte aux champs modifiés : le strict nécessaire pour revenir
      // en arrière, sans stocker des lignes entières inutilement.
      const champs = Object.keys(valeurs)
      const avant = (await anyDb.select().from(table).where(cible))
        .map((r: Record<string, unknown>) => ({
          id: String(r.id),
          valeurs: Object.fromEntries(champs.map(c => [c, r[c] ?? null])),
        }))
      if (!avant.length) return { ok: true as const, modifiees: 0, annulationId: null }

      const rows = await anyDb.update(table).set(valeurs).where(cible).returning()
      const annulationId = await deposerAnnulation('modification', avant)
      return { ok: true as const, modifiees: rows.length, annulationId }
    },
    {
      ...write,
      ...doc(`${prefix} — modifier en masse`,
        'Désigne les lignes par `ids` (celles cochées) **ou** par `filtre` (tous les résultats, y compris non affichés). Renvoie un `annulationId` valable 24 h.'),
      body: t.Object({
        ids: t.Optional(t.Array(t.String())),
        filtre: t.Optional(t.Record(t.String(), t.String())),
        valeurs: t.Record(t.String(), t.Unknown()),
      }),
    },
  )
  .delete(
    '/lot',
    async ({ body: input, status }) => {
      const { ids, filtre } = input as { ids?: string[], filtre?: Record<string, string> }
      const cible = ids?.length ? inArray(idCol, ids) : (filtre ? critereDe(filtre) : undefined)
      if (!cible) return status(422, { message: 'Aucune ligne désignée.' })

      // Lignes COMPLÈTES : une suppression ne s'annule qu'en les réinsérant telles quelles.
      const avant = await anyDb.select().from(table).where(cible)
      if (!avant.length) return { ok: true as const, supprimees: 0, annulationId: null }

      const supprimes = avant.map((r: Record<string, unknown>) => String(r.id))
      await anyDb.delete(table).where(cible)
      await db
        .delete(pieceJointe)
        .where(and(eq(pieceJointe.typeSource, category), inArray(pieceJointe.sourceId, supprimes)))
      const annulationId = await deposerAnnulation('suppression', avant)
      return { ok: true as const, supprimees: avant.length, annulationId }
    },
    {
      ...write,
      ...doc(`${prefix} — supprimer en masse`,
        'Mêmes modes de désignation que la modification. Les pièces jointes rattachées sont supprimées. Renvoie un `annulationId` valable 24 h.'),
      body: t.Object({
        ids: t.Optional(t.Array(t.String())),
        filtre: t.Optional(t.Record(t.String(), t.String())),
      }),
    },
  )
  // Combien de lignes une action « sur tous les résultats » toucherait-elle ?
  .get(
    '/lot/compte',
    async ({ query }) => {
      const [{ n }] = await anyDb
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(critereDe(query as Record<string, unknown>))
      return { total: Number(n) }
    },
    {
      ...read,
      ...doc(`${prefix} — compter les résultats d'un filtre`, "Nombre de lignes qu'une action groupée toucherait. À appeler avant de confirmer."),
      query: t.Object({}, { additionalProperties: true }),
    },
  )
  // Exécute un point d'annulation. Idempotent par consommation : le point est retiré
  // une fois rejoué, pour qu'un double clic ne réapplique pas l'opération.
  .post(
    '/lot/annuler/:annulationId',
    async ({ params, status }) => {
      const [point] = await db.select().from(annulationLot).where(eq(annulationLot.id, params.annulationId))
      if (!point) return status(404, { message: "Ce point d'annulation n'existe plus (ils expirent au bout de 24 h)." })
      if (point.endpoint !== prefix) return status(422, { message: "Ce point d'annulation concerne un autre catalogue." })

      let restaurees = 0
      if (point.type === 'suppression') {
        const lignes = (point.contenu as Record<string, unknown>[]).map(retyper)
        const rows = await anyDb.insert(table).values(lignes).onConflictDoNothing().returning()
        restaurees = rows.length
      }
      else {
        // Les valeurs d'origine diffèrent d'une ligne à l'autre : pas d'UPDATE unique.
        const lignes = point.contenu as { id: string, valeurs: Record<string, unknown> }[]
        for (const l of lignes) {
          const r = await anyDb.update(table).set(retyper(l.valeurs)).where(eq(idCol, l.id)).returning()
          restaurees += r.length
        }
      }
      await db.delete(annulationLot).where(eq(annulationLot.id, params.annulationId))
      return { ok: true as const, restaurees }
    },
    {
      ...write,
      ...doc(`${prefix} — annuler une action groupée`, "Rejoue l'état antérieur. Le point d'annulation est consommé : un second appel est sans effet."),
      params: t.Object({ annulationId: t.String() }),
    },
  )
}
