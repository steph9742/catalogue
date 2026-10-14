import { t } from 'elysia'

// PAGINATION PARTAGÉE — une seule définition de la forme promise par le contrat.

export const PAGE_TAILLE_MAX = 200
export const PAGE_TAILLE_DEFAUT = 50

/** Le fragment de schéma à fusionner dans le `query` d'une route de liste. */
export const SCHEMA_PAGINATION = {
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
}

export type ParamsPagination = { page?: string, pageSize?: string }

/**
 * `pageSize` SEUL suffit, et c'est délibéré. Demander la première page sans l\'écrire est
 * l'usage le plus courant, et exiger les deux paramètres ferait silencieusement retomber
 * l'appelant sur le tableau complet — une réponse plausible qui n\'est pas celle qu\'il a
 * demandée.
 */
export function pagineDemandee(query: ParamsPagination): boolean {
  return query.page !== undefined || query.pageSize !== undefined
}

export type Bornes = { page: number, pageSize: number, limit: number, offset: number }

/**
 * Les bornes, toujours dans le domaine valide. `Number('abc')` vaut NaN et NaN est faux : `||
 * defaut` rattrape donc aussi bien le paramètre absent que le paramètre illisible.
 */
export function bornes(query: ParamsPagination): Bornes {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1)
  const pageSize = Math.min(PAGE_TAILLE_MAX, Math.max(1, Math.floor(Number(query.pageSize)) || PAGE_TAILLE_DEFAUT))
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize }
}

export type Enveloppe<R> = { rows: R[], total: number, page: number, pageSize: number }

/**
 * L'enveloppe promise par le contrat, § 10. `total` vient TOUJOURS d\'un décompte de la base,
 * jamais de `rows.length` : c'est la doctrine du § 2, et une enveloppe qui compterait ses
 * propres lignes annoncerait le plafond comme total dès la première page.
 */
export function enveloppe<R>(rows: R[], total: number, b: Bornes): Enveloppe<R> {
  return { rows, total, page: b.page, pageSize: b.pageSize }
}

/**
 * Pagination d'une liste DÉJÀ ASSEMBLÉE en mémoire. Réservée aux routes qui composent leur
 * résultat en JavaScript et ne peuvent pas déléguer `limit`/`offset` à la base —
 * `/api/responsables` agrège plusieurs requêtes.
 */
export function paginerEnMemoire<R>(query: ParamsPagination, tout: R[]): Enveloppe<R> | R[] {
  if (!pagineDemandee(query)) return tout
  const b = bornes(query)
  return enveloppe(tout.slice(b.offset, b.offset + b.limit), tout.length, b)
}
