import { Elysia } from 'elysia'

// LUTTE CONTRE LA FORCE BRUTE sur l'authentification par mot de passe. Le SSO est la voie
// normale, mais la connexion de secours (/login-secours) contourne l'annuaire : rien n'y
// freinait des tentatives répétées.

const FENETRE_MS = 15 * 60 * 1000 // durée d'observation des échecs
const SEUIL_IP = 10 // échecs tolérés depuis une même adresse
const SEUIL_EMAIL = 5 // échecs tolérés sur un même compte
const PURGE_MS = 60 * 60 * 1000 // nettoyage périodique des compteurs éteints

type Compteur = { echecs: number, premier: number, dernier: number, bloqueJusqua: number }

const compteurs = new Map<string, Compteur>()

/** Blocage progressif : 1 min, puis 5, 15, 30, et 60 au maximum. */
function dureeBlocage(echecs: number, seuil: number): number {
  const paliers = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]
  const rang = Math.min(Math.floor((echecs - seuil) / seuil), paliers.length - 1)
  return paliers[Math.max(0, rang)]!
}

function etat(cle: string): Compteur {
  const maintenant = Date.now()
  const c = compteurs.get(cle)
  // Compteur expiré (aucun échec récent) : on repart de zéro.
  if (!c || (maintenant - c.dernier > FENETRE_MS && maintenant > c.bloqueJusqua)) {
    const neuf = { echecs: 0, premier: maintenant, dernier: maintenant, bloqueJusqua: 0 }
    compteurs.set(cle, neuf)
    return neuf
  }
  return c
}

/** Secondes restantes avant de pouvoir réessayer, 0 si la voie est libre. */
export function attenteRestante(ip: string, email: string): number {
  const maintenant = Date.now()
  const fins = [etat(`ip:${ip}`).bloqueJusqua, etat(`email:${email.toLowerCase()}`).bloqueJusqua]
  const fin = Math.max(...fins)
  return fin > maintenant ? Math.ceil((fin - maintenant) / 1000) : 0
}

export function enregistrerEchec(ip: string, email: string): void {
  const maintenant = Date.now()
  for (const [cle, seuil] of [[`ip:${ip}`, SEUIL_IP], [`email:${email.toLowerCase()}`, SEUIL_EMAIL]] as const) {
    const c = etat(cle)
    c.echecs++
    c.dernier = maintenant
    if (c.echecs >= seuil) {
      c.bloqueJusqua = maintenant + dureeBlocage(c.echecs, seuil)
    }
  }
}

/** Connexion réussie : on efface l'ardoise, l\'utilisateur légitime ne doit pas traîner un historique. */
export function enregistrerSucces(ip: string, email: string): void {
  compteurs.delete(`ip:${ip}`)
  compteurs.delete(`email:${email.toLowerCase()}`)
}

/** Adresse du client, en tenant compte du reverse proxy qui est toujours devant. */
export function adresseClient(request: Request): string {
  const transmise = request.headers.get('x-forwarded-for')
  // `X-Forwarded-For` peut chaîner plusieurs adresses : la première est le client d'origine.
  if (transmise) return transmise.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'inconnue'
}

// Nettoyage périodique : sans lui, la table grossirait indéfiniment sur une instance
// exposée à des tentatives régulières.
if (typeof setInterval === 'function') {
  const minuteur = setInterval(() => {
    const maintenant = Date.now()
    for (const [cle, c] of compteurs) {
      if (maintenant - c.dernier > FENETRE_MS && maintenant > c.bloqueJusqua) compteurs.delete(cle)
    }
  }, PURGE_MS)
  // Ne pas retenir le processus en vie pour ce seul minuteur.
  ;(minuteur as unknown as { unref?: () => void }).unref?.()
}

// CONNEXION DE SECOURS ACTIVABLE. `AUTH_SECOURS=false` ferme la connexion par mot de passe :
// seul le SSO reste ouvert.
export function secoursOuvert(): boolean {
  const oidcConfigure = !!process.env.OUATE_CLIENT_ID
  if (!oidcConfigure) return true
  return (process.env.AUTH_SECOURS ?? 'true').toLowerCase() !== 'false'
}

/**
 * Garde posée AVANT le montage de better-auth : elle doit intercepter la requête avant que la
 * vérification du mot de passe n'ait lieu.
 */
export const limiteurConnexion = new Elysia({ name: 'limiteur-connexion' })
  .onRequest(async ({ request, set }) => {
    const url = new URL(request.url)
    if (request.method !== 'POST' || !url.pathname.startsWith('/api/auth/sign-in')) return

    // Connexion par mot de passe désactivée : on refuse avant toute vérification.
    // Le refus vaut aussi pour l'API, sans quoi masquer la page ne serait que cosmétique.
    if (url.pathname.startsWith('/api/auth/sign-in/email') && !secoursOuvert()) {
      console.warn(`🚫 Connexion par mot de passe refusée (AUTH_SECOURS=false) — ${adresseClient(request)}`)
      set.status = 403
      return { message: "La connexion par mot de passe est désactivée. Utilisez l'authentification unique." }
    }

    // Le corps est lu sur un clone : le consommer priverait better-auth de la requête.
    let email = ''
    try {
      const corps = await request.clone().json() as { email?: string }
      email = typeof corps.email === 'string' ? corps.email : ''
    }
    catch { /* corps illisible : on se rabat sur le seul comptage par IP */ }

    const ip = adresseClient(request)
    const attente = attenteRestante(ip, email)
    if (attente > 0) {
      console.warn(`🚫 Connexion bloquée (force brute) — ${ip} / ${email || 'sans e-mail'} — ${attente} s restantes`)
      set.status = 429
      set.headers['retry-after'] = String(attente)
      return {
        message: `Trop de tentatives infructueuses. Réessayez dans ${attente >= 60 ? `${Math.ceil(attente / 60)} minute(s)` : `${attente} seconde(s)`}.`,
      }
    }
  })
  .onAfterResponse(({ request, set }) => {
    const url = new URL(request.url)
    if (request.method !== 'POST' || !url.pathname.startsWith('/api/auth/sign-in')) return

    const statut = Number(set.status ?? 200)
    if (statut === 429) return // déjà bloqué : ne pas aggraver le compteur

    void (async () => {
      let email = ''
      try {
        const corps = await request.clone().json() as { email?: string }
        email = typeof corps.email === 'string' ? corps.email : ''
      }
      catch { /* sans e-mail, seul le comptage par IP s'applique */ }

      const ip = adresseClient(request)
      if (statut >= 200 && statut < 300) enregistrerSucces(ip, email)
      else enregistrerEchec(ip, email)
    })()
  })
