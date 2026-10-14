import { t } from 'elysia'
import { Value } from '@sinclair/typebox/value'
import { eq, getTableColumns } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-typebox'
import { db } from '@catalogue/database'
import type { ReferenceResolver } from './importRefs'

// Import générique par catalogue : upsert par clé naturelle, avec dry-run.
export type ImportReport = {
  dryRun: boolean
  total: number
  created: number
  updated: number
  relatedCreated: { label: string, nom: string }[]
  errors: { line: number, cle: string, message: string }[]
}

const SKIP = new Set(['id', 'createdAt', 'updatedAt'])

export function makeImport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  naturalKey: string,
  references: ReferenceResolver[] = [],
) {
  const cols = getTableColumns(table)
  const insert = createInsertSchema(table)
  const rowSchema = t.Partial(t.Omit(insert, ['id', 'createdAt', 'updatedAt']))

  const coerce = (raw: Record<string, unknown>) => {
    const out: Record<string, unknown> = {}
    for (const [key, col] of Object.entries(cols)) {
      if (SKIP.has(key)) continue
      const v = raw[key]
      if (v === undefined || v === null || String(v).trim() === '') continue
      const s = String(v).trim()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      switch ((col as any).dataType) {
        case 'boolean':
          out[key] = /^(oui|yes|true|vrai|1|x)$/i.test(s)
          break
        case 'number': {
          const n = Number(s)
          if (!Number.isNaN(n)) out[key] = n
          break
        }
        case 'array':
          break
        default:
          out[key] = s
      }
    }
    return out
  }

  const bodySchema = t.Object({
    rows: t.Array(t.Record(t.String(), t.Any())),
    dryRun: t.Optional(t.Boolean()),
  })

  const handler = async ({
    body,
  }: {
    body: { rows: Record<string, unknown>[], dryRun?: boolean }
  }): Promise<ImportReport> => {
    const dryRun = body.dryRun ?? true
    const report: ImportReport = {
      dryRun,
      total: body.rows.length,
      created: 0,
      updated: 0,
      relatedCreated: [],
      errors: [],
    }

    // Cache par import : nom → id (évite doublons et requêtes répétées) ;
    // relatedSeen dédoublonne les créations rapportées.
    const cache = new Map<string, string>()
    const relatedSeen = new Set<string>()

    const resolveReferences = async (raw: Record<string, unknown>, cleaned: Record<string, unknown>) => {
      for (const ref of references) {
        const nk = ref.naturalKey ?? 'nom'
        const val = raw[ref.column]
        if (val === undefined || val === null || String(val).trim() === '') continue
        const name = String(val).trim()
        const ck = `${ref.fkField}:${name.toLowerCase()}`
        let id = cache.get(ck)
        if (!id) {
          const [ex] = await db.select({ id: ref.table.id }).from(ref.table).where(eq(ref.table[nk], name)).limit(1)
          if (ex) {
            id = ex.id as string
          }
          else if (ref.create !== false) {
            if (!relatedSeen.has(ck)) {
              relatedSeen.add(ck)
              report.relatedCreated.push({ label: ref.label, nom: name })
            }
            if (!dryRun) {
              const [ins] = await db.insert(ref.table).values({ [nk]: name, ...(ref.defaults ?? {}) }).returning({ id: ref.table.id })
              id = ins!.id as string
            }
          }
          // ref.create === false et introuvable : on ne crée pas, on laisse le lien vide.
          if (id) cache.set(ck, id)
        }
        if (id) cleaned[ref.fkField] = id
        else delete cleaned[ref.fkField] // dry-run d'une création : retire le nom laissé par coerce
      }
    }

    for (let i = 0; i < body.rows.length; i++) {
      const raw = body.rows[i]!
      const cleaned = coerce(raw)
      const keyVal = cleaned[naturalKey]

      if (keyVal === undefined || keyVal === '') {
        report.errors.push({ line: i + 1, cle: '', message: `Clé « ${naturalKey} » manquante` })
        continue
      }

      try {
        await resolveReferences(raw, cleaned)

        if (!Value.Check(rowSchema, cleaned)) {
          const err = [...Value.Errors(rowSchema, cleaned)][0]
          report.errors.push({
            line: i + 1,
            cle: String(keyVal),
            message: err ? `${err.path || 'valeur'} : ${err.message}` : 'Ligne invalide',
          })
          continue
        }

        const existing = await db
          .select()
          .from(table)
          .where(eq(table[naturalKey], keyVal))
          .limit(1)
        if (existing.length) {
          if (!dryRun) await db.update(table).set(cleaned).where(eq(table[naturalKey], keyVal))
          report.updated++
        }
        else {
          if (!dryRun) await db.insert(table).values(cleaned)
          report.created++
        }
      }
      catch (e) {
        report.errors.push({
          line: i + 1,
          cle: String(keyVal),
          message: e instanceof Error ? e.message : 'Erreur base de données',
        })
      }
    }

    return report
  }

  return { handler, bodySchema }
}
