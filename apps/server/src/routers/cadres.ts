import { Elysia, t } from 'elysia'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { cadreReferentiel } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'

// CADRES DE RÉFÉRENCE ACTIVÉS. Le catalogue des cadres est connu du code, pas saisi : ce sont
// les référentiels que l'application sait porter.
const CADRES = [
  {
    code: 'nis2',
    nom: 'NIS 2 — référentiel ReCyF',
    description: "Directive (UE) 2022/2555 et son référentiel ANSSI : objectifs de sécurité, exigences, plan d'actions et notification d'incidents.",
    ordre: 10,
  },
  {
    code: 'iso27001',
    nom: 'ISO/IEC 27001',
    description: "Système de management de la sécurité de l'information : gouvernance, objectifs, audits, revues de direction, non-conformités.",
    ordre: 20,
  },
  {
    code: 'iso27002',
    nom: 'ISO/IEC 27002',
    description: "Mesures de sécurité servant de base à la déclaration d'applicabilité (SoA).",
    ordre: 30,
  },
  {
    code: 'iso27005',
    nom: 'ISO/IEC 27005',
    description: "Gestion des risques de sécurité de l'information : appréciation, traitement, acceptation. Mis en œuvre ici par la démarche EBIOS RM.",
    ordre: 40,
  },
  {
    code: 'rgpd',
    nom: 'RGPD — exigences de sécurité',
    description: 'Règlement (UE) 2016/679, volet sécurité du traitement : articles 5.1.f, 24, 25, 28, 30, 32, 33, 34 et 35.',
    ordre: 50,
  },
] as const

/**
 * Garantit la présence des cadres connus, sans écraser leur état d'activation.
 */
async function assurerCadres() {
  await db.insert(cadreReferentiel)
    .values(CADRES.map(c => ({ ...c })))
    .onConflictDoUpdate({
      target: cadreReferentiel.code,
      set: {
        nom: cadreReferentiel.nom,
        description: cadreReferentiel.description,
      },
    })
    .catch(() => { /* concurrence au démarrage : la ligne existe déjà, c'est le but */ })
}

export const cadresRouter = new Elysia({ name: 'cadres' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Conformité'] } })

  // Lecture ouverte à toute session : le menu de CHAQUE utilisateur en dépend. Réserver
  // cette route aux administrateurs masquerait tout le référentiel à tout le monde.
  .get('/api/cadres', async ({ query }) => {
    await assurerCadres()
    const base = db.select().from(cadreReferentiel).orderBy(asc(cadreReferentiel.ordre))
    if (!pagineDemandee(query)) return base
    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      db.select({ n: sql<number>`count(*)::int` }).from(cadreReferentiel),
    ])
    return enveloppe(rows, compte?.n ?? 0, b)
  }, { auth: ['user', 'admin', 'svc'], query: t.Object({ ...SCHEMA_PAGINATION }) })

  .patch('/api/cadres/:code', async ({ params, body, status }) => {
    const [row] = await db.update(cadreReferentiel)
      .set({ actif: body.actif, updatedAt: new Date() })
      .where(eq(cadreReferentiel.code, params.code))
      .returning()
    if (!row) return status(404, { message: 'Cadre inconnu.' })
    return row
  }, {
    auth: ['admin'],
    params: t.Object({ code: t.String() }),
    body: t.Object({ actif: t.Boolean() }),
  })
