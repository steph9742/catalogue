import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { posteTravail, serveur } from '@catalogue/database/tables'
import { cleTechnologie } from './eolApi'

// RÉCONCILIATION DE LA CLÉ DE TECHNOLOGIE. LA PANNE QU'ON ÉVITE, et elle nous a été racontée
// plutôt que devinée.

export type ResultatReconciliation = {
  table: string
  examinees: number
  ecrites: number
  /** Lignes sans OS : elles n'ont pas de clé, et ce n\'est pas une lacune. */
  sansOs: number
}

async function reconcilierTable(
  nom: string,
  table: typeof serveur | typeof posteTravail,
): Promise<ResultatReconciliation> {
  const lignes = await db
    .select({
      id: table.id,
      os: table.os,
      osVersion: table.osVersion,
      cle: table.technologieCle,
    })
    .from(table)

  let ecrites = 0
  let sansOs = 0
  for (const l of lignes) {
    if (!l.os) {
      sansOs++
      // Une machine sans OS n'a pas de clé. Si une valeur traîne, on la retire : une clé
      // orpheline rapprocherait la machine d'une technologie qu'elle ne porte plus.
      if (l.cle !== null) {
        await db.update(table).set({ technologieCle: null }).where(eq(table.id, l.id))
        ecrites++
      }
      continue
    }
    const attendue = cleTechnologie(l.os, l.osVersion) || null
    if (l.cle !== attendue) {
      await db.update(table).set({ technologieCle: attendue }).where(eq(table.id, l.id))
      ecrites++
    }
  }
  return { table: nom, examinees: lignes.length, ecrites, sansOs }
}

/**
 * Recalcule la clé sur l'ensemble du parc. Idempotente : un second passage n\'écrit rien.
 */
export async function reconcilierClesTechnologie(): Promise<ResultatReconciliation[]> {
  return [
    await reconcilierTable('serveur', serveur),
    await reconcilierTable('poste_travail', posteTravail),
  ]
}

/**
 * Ce que la reprise n'a pas encore couvert. SÉPARÉ DES COMPTEURS DE SUPPORT, et c\'est la
 * seconde précaution demandée.
 */
export async function clesNonEvaluees(): Promise<{ serveurs: number, postes: number, total: number }> {
  const compter = async (table: typeof serveur | typeof posteTravail) =>
    (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      // `and(...)`, jamais `&&` : en JavaScript, `a && b` sur deux fragments SQL rend
      // simplement `b`, et la première condition disparaît sans erreur ni avertissement.
      .where(and(isNull(table.technologieCle), isNotNull(table.os))))[0]?.n ?? 0

  const serveurs = await compter(serveur)
  const postes = await compter(posteTravail)
  return { serveurs, postes, total: serveurs + postes }
}
