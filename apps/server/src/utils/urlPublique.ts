// URL PUBLIQUES DES FICHES. Les listes renvoyaient des chemins relatifs (`/serveurs/{id}`).

function origine(): string {
  return (process.env.BETTER_AUTH_URL ?? '').trim().replace(/\/+$/, '')
}

function sousChemin(): string {
  const b = (process.env.BASE_PATH ?? '').trim().replace(/\/+$/, '')
  return b && !b.startsWith('/') ? `/${b}` : b
}

/**
 * Transforme un chemin de fiche en URL absolue. Rend le chemin INCHANGÉ quand l'origine n\'est
 * pas configurée : en développement, une URL absolue fabriquée sur une origine devinée serait
 * fausse, et une URL fausse est plus nuisible qu'une URL relative — elle a l\'air d\'une adresse.
 */
export function urlPublique(chemin: string): string {
  const o = origine()
  const c = chemin.startsWith('/') ? chemin : `/${chemin}`
  if (!o) return c
  return `${o}${sousChemin()}${c}`
}

/** L'origine publique complète, sous-chemin compris, ou `null` si non configurée. */
export function originePublique(): string | null {
  const o = origine()
  return o ? `${o}${sousChemin()}` : null
}
