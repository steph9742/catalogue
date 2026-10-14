// Client REST GLPI (apirest.php). GLPI v11, inventaire natif.
export const GLPI_CHAMP = { ID: 2, NOM: 1, TYPE: 4, OS: 45, OS_VERSION: 46, ENTITE: 80, LIEU: 3, GROUPE: 71, GROUPE_TECH: 49, SERIE: 5 } as const

export type GlpiComputer = { glpiId: string, nom: string, type: string | null, os: string | null, osVersion: string | null, entite: string | null, lieu: string | null, groupe: string | null, groupeTechnique: string | null, numeroSerie: string | null }

export type GlpiConfig = { url: string, appToken: string, userToken: string }

// Normalise l'URL de base et compose l'endpoint apirest.php.
function apiBase(url: string): string {
  const clean = url.trim().replace(/\/+$/, '')
  return clean.endsWith('/apirest.php') ? clean : `${clean}/apirest.php`
}

async function initSession(cfg: GlpiConfig): Promise<string> {
  const res = await fetch(`${apiBase(cfg.url)}/initSession`, {
    headers: {
      'App-Token': cfg.appToken,
      'Authorization': `user_token ${cfg.userToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`initSession GLPI a échoué (HTTP ${res.status}). ${txt.slice(0, 200)}`)
  }
  const data = await res.json() as { session_token?: string }
  if (!data.session_token) throw new Error('GLPI n\'a pas renvoyé de session_token.')
  return data.session_token
}

async function killSession(cfg: GlpiConfig, sessionToken: string): Promise<void> {
  await fetch(`${apiBase(cfg.url)}/killSession`, {
    headers: { 'App-Token': cfg.appToken, 'Session-Token': sessionToken },
  }).catch(() => {})
}

// Teste la connexion : ouvre puis ferme une session. Renvoie un message lisible.
export async function testerConnexionGlpi(cfg: GlpiConfig): Promise<{ ok: boolean, message: string }> {
  try {
    const token = await initSession(cfg)
    await killSession(cfg, token)
    return { ok: true, message: 'Connexion à GLPI réussie.' }
  }
  catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

type SearchRow = Record<string, unknown>
type SearchResponse = { totalcount?: number, count?: number, data?: SearchRow[] }

// Valeur texte d'une cellule de recherche GLPI. `String(v)` ne suffit pas sur les champs de
// type dropdown : quand une machine porte PLUSIEURS valeurs (deux groupes), GLPI renvoie un
// tableau ; certaines versions enveloppent la valeur dans un objet `{ name: … }`.
function texte(v: unknown): string | null {
  if (v == null || v === '') return null
  if (Array.isArray(v)) {
    const parts = v.map(texte).filter((x): x is string => !!x)
    return parts.length ? [...new Set(parts)].join(' ; ') : null
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return texte(o.completename ?? o.name ?? null)
  }
  return String(v).trim() || null
}

// Récupère TOUTES les machines de GLPI, page par page (range). `onLot` reçoit chaque
// lot pour un traitement en flux — évite de charger 9000 machines en mémoire d'un coup.
export async function parcourirComputers(
  cfg: GlpiConfig,
  onLot: (lot: GlpiComputer[]) => Promise<void>,
  opts: { taillePage?: number } = {},
): Promise<{ total: number }> {
  const taillePage = opts.taillePage ?? 200
  const token = await initSession(cfg)
  try {
    // L'ID (option 2) est indispensable en tête : c'est la clé de réidentification.
    const champs = [
      GLPI_CHAMP.ID, GLPI_CHAMP.NOM, GLPI_CHAMP.TYPE, GLPI_CHAMP.OS, GLPI_CHAMP.OS_VERSION,
      GLPI_CHAMP.ENTITE, GLPI_CHAMP.LIEU, GLPI_CHAMP.GROUPE, GLPI_CHAMP.GROUPE_TECH,
      GLPI_CHAMP.SERIE,
    ]
    const forced = champs.map((c, i) => `forcedisplay[${i}]=${c}`).join('&')
    let debut = 0
    let total = 0
    for (;;) {
      const fin = debut + taillePage - 1
      const url = `${apiBase(cfg.url)}/search/Computer?${forced}&range=${debut}-${fin}&order=ASC`
      const res = await fetch(url, {
        headers: { 'App-Token': cfg.appToken, 'Session-Token': token, 'Content-Type': 'application/json' },
      })
      // 206 Partial Content est normal quand tout n'a pas été renvoyé.
      if (!res.ok && res.status !== 206) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Recherche GLPI a échoué (HTTP ${res.status}). ${txt.slice(0, 200)}`)
      }
      const body = await res.json() as SearchResponse
      total = body.totalcount ?? total
      const rows = body.data ?? []
      if (!rows.length) break

      await onLot(rows.map((r) => {
        // L'id de l'item GLPI est renvoyé sous la clé de l'option 2 (forcée ci-dessus) ;
        // fallback sur "id" par prudence selon les versions.
        const glpiId = String(r[GLPI_CHAMP.ID] ?? r['id'] ?? '')
        const nom = texte(r[GLPI_CHAMP.NOM]) ?? `GLPI-${glpiId}`
        return {
          glpiId,
          nom,
          type: texte(r[GLPI_CHAMP.TYPE]),
          os: texte(r[GLPI_CHAMP.OS]),
          osVersion: texte(r[GLPI_CHAMP.OS_VERSION]),
          entite: texte(r[GLPI_CHAMP.ENTITE]),
          lieu: texte(r[GLPI_CHAMP.LIEU]),
          groupe: texte(r[GLPI_CHAMP.GROUPE]),
          groupeTechnique: texte(r[GLPI_CHAMP.GROUPE_TECH]),
          numeroSerie: texte(r[GLPI_CHAMP.SERIE]),
        }
      }).filter(m => m.glpiId))

      debut += taillePage
      if (total && debut >= total) break
      if (rows.length < taillePage) break
    }
    return { total }
  }
  finally {
    await killSession(cfg, token)
  }
}
