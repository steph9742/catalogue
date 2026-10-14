import { sql, type Column, type SQL } from 'drizzle-orm'

// PARTITION SUR UN VOCABULAIRE FERMÉ — un compteur par valeur, dérivé de l'énumération.

/**
 * Compteurs SQL, un par valeur, à étaler dans un `select`. db.select({ total: …,
 * ...partitionSql(exigenceNis2.conformite, nis2Conformite.enumValues) }) Les valeurs NULLES ne
 * sont dans AUCUNE branche : `count(*) filter (where col = 'x')` les exclut toutes.
 */
export function partitionSql<T extends string>(
  colonne: Column,
  valeurs: readonly T[],
): Record<T, SQL<number>> {
  return Object.fromEntries(
    valeurs.map(v => [v, sql<number>`count(*) filter (where ${colonne} = ${v})::int`]),
  ) as Record<T, SQL<number>>
}

/**
 * La même chose, plus le compteur des valeurs nulles sous le nom donné. `total` moins la somme
 * de cette partition doit valoir zéro : c'est ce qui fait d\'elle une partition et non une
 * collection d'indicateurs.
 */
export function partitionAvecNul<T extends string, N extends string>(
  colonne: Column,
  valeurs: readonly T[],
  nomDuNul: N,
): Record<T | N, SQL<number>> {
  return {
    ...partitionSql(colonne, valeurs),
    [nomDuNul]: sql<number>`count(*) filter (where ${colonne} is null)::int`,
  } as Record<T | N, SQL<number>>
}

/**
 * Partition d'une liste déjà en mémoire, pour les résumés composés en JavaScript.
 */
export function partitionEnMemoire<T extends string, L>(
  lignes: readonly L[],
  valeurs: readonly T[],
  cle: (l: L) => T | null | undefined,
  poids: (l: L) => number = () => 1,
): Record<T, number> {
  const compte = Object.fromEntries(valeurs.map(v => [v, 0])) as Record<T, number>
  for (const l of lignes) {
    const v = cle(l)
    if (v != null && v in compte) compte[v] += poids(l)
  }
  return compte
}
