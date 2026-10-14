import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { userCategoryRole } from '@catalogue/database/tables'
import { CATEGORY_KEYS } from './categories'

// Correspondance échéance → catégorie (pour filtrer les notifs par droit).
const ECHEANCE_CATEGORY: Record<string, string> = {
  vpn_expiration: 'vpn',
  techno_eol: 'technologies',
  contrat_fin: 'tiers',
  app_fin_support: 'applications',
  homologation_revue: 'applications',
  certificat_expiration: 'certificats',
}

export function eventCategory(key: string): string | null {
  if (key.startsWith('echeance:')) return ECHEANCE_CATEGORY[key.slice('echeance:'.length)] ?? null
  if (key.startsWith('demande:')) return key.slice('demande:'.length) || null
  const cat = key.split(':')[0]
  return cat || null
}

// `role: 'service'` désigne un COMPTE DE SERVICE, pas un utilisateur : le middleware
// fabrique cette forme à partir du compte, avec ses scopes. Elle n'existe qu'en mémoire.
type SessionUser = { id: string, role?: string | null, scopes?: readonly string[] } | undefined

async function rolesOf(userId: string) {
  const rows = await db.select().from(userCategoryRole).where(eq(userCategoryRole.userId, userId))
  const map: Record<string, string> = {}
  for (const r of rows) map[r.category] = r.role
  return map
}

/**
 * ACCÈS PORTÉ PAR UNE REQUÊTE — utilisateur, ou compte de service. Le middleware place la
 * session sous `ctx.user`, mais un compte de service sous `ctx.service_account` : `ctx.user` y
 * reste INDÉFINI.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function accesDe(ctx: any): SessionUser {
  if (ctx?.user) return ctx.user as SessionUser
  const compte = ctx?.service_account
  if (!compte) return undefined
  return { id: String(compte.id), role: 'service', scopes: (compte.scopes ?? []) as readonly string[] }
}

/**
 * PORTÉE D'UN COMPTE DE SERVICE — décidée ici, écrite, et non déduite. Ce qui ne l\'était pas,
 * c'est la façon dont ça se produisait.
 */
export function porteeService(scopes: readonly string[] | undefined): Set<string> {
  const liste = scopes ?? []
  const explicites = liste.filter(s => s.startsWith('cat:')).map(s => s.slice(4))
  if (explicites.length) return new Set(explicites.filter(c => (CATEGORY_KEYS as readonly string[]).includes(c)))
  return new Set(liste.includes('read') || liste.includes('admin') ? CATEGORY_KEYS : [])
}

// Catégories lisibles. Un accès absent ne donne plus rien : c'était la porte dérobée.
export async function readableCategories(user: SessionUser): Promise<Set<string>> {
  if (!user) return new Set()
  if (user.role === 'admin') return new Set(CATEGORY_KEYS)
  if (user.role === 'service') return porteeService(user.scopes)
  return new Set(Object.keys(await rolesOf(user.id)))
}

// Catégories gérées (rôle gestionnaire ; admin → toutes). Un compte de service ne gère
// que s'il porte `write` — l'assistant, lui, est en lecture seule et n'en gère aucune.
export async function managedCategories(user: SessionUser): Promise<Set<string>> {
  if (!user) return new Set()
  if (user.role === 'admin') return new Set(CATEGORY_KEYS)
  if (user.role === 'service') {
    const liste = user.scopes ?? []
    return liste.includes('write') || liste.includes('admin') ? porteeService(liste) : new Set()
  }
  const map = await rolesOf(user.id)
  return new Set(Object.entries(map).filter(([, r]) => r === 'gestionnaire').map(([c]) => c))
}
