import { auth } from '@catalogue/auth'

/**
 * L'AUTEUR D\'UNE DÉCISION — accepter un risque, valider une référence, écarter une découverte.
 */
export async function auteurDecision(headers: Headers): Promise<string> {
  if (headers.get('x-internal-token')) return 'demande validée (workflow)'
  try {
    const s = await auth.api.getSession({ headers })
    if (s?.user) return s.user.email ?? s.user.name ?? s.user.id
  }
  catch { /* compte de service */ }
  return 'compte de service'
}
