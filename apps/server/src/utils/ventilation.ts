import { sql, type Column } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { db } from '@catalogue/database'
import type { PgTable } from 'drizzle-orm/pg-core'

// VENTILATION PAR UN AXE ORGANISATIONNEL — « combien de serveurs à l'UFR ST ».

export type Ventilation = {
  /** L'axe, sous la forme du point d\'entrée qui en énumère les valeurs. */
  axe: string
  total: number
  /**
   * LE NON-RATTACHÉ, nommé et non omis. Une machine sans composante n'apparaît dans aucune
   * ligne.
   */
  sansRattachement: number
  lignes: Array<{ id: string, libelle: string, nombre: number }>
}

/**
 * Compte les lignes d'une table par la valeur d\'une clé étrangère, avec le libellé résolu.
 */
export async function ventiler(
  table: PgTable,
  cle: Column,
  refTable: PgTable,
  refId: PgColumn,
  refNom: PgColumn,
  axe: string,
): Promise<Ventilation> {
  const [rows, [tot]] = await Promise.all([
    db
      .select({ id: refId, libelle: refNom, nombre: sql<number>`count(*)::int` })
      .from(table)
      .innerJoin(refTable, sql`${cle} = ${refId}`)
      .groupBy(refId, refNom)
      .orderBy(sql`count(*) desc`),
    db.select({
      total: sql<number>`count(*)::int`,
      sans: sql<number>`count(*) filter (where ${cle} is null)::int`,
    }).from(table),
  ])
  return {
    axe,
    total: tot?.total ?? 0,
    sansRattachement: tot?.sans ?? 0,
    lignes: rows as Array<{ id: string, libelle: string, nombre: number }>,
  }
}
