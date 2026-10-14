// Préférences de navigation : épingles + ordre des sections (EN BASE, donc suivent
// l'utilisateur d'un poste à l'autre) et pages récemment consultées (dans le NAVIGATEUR, car «
// récemment vu » décrit l'activité sur un appareil donné).
export type PageConnue = { libelle: string, url: string, icon: string }

const CLE_RECENTS = 'catalogue.nav.recents'
const MAX_RECENTS = 5

export function useNavPrefs() {
  const api = useApi()

  const epingles = useState<string[]>('nav-epingles', () => [])
  const ordreSections = useState<string[]>('nav-ordre-sections', () => [])
  const recents = useState<PageConnue[]>('nav-recents', () => [])
  const charge = useState<boolean>('nav-prefs-charge', () => false)

  // --- Chargement (une fois par session de navigation) --------------------------------
  async function charger() {
    if (charge.value) return
    charge.value = true
    try {
      const r = await api<{ epingles: string[], ordreSections: string[] }>('/api/preferences')
      epingles.value = r.epingles ?? []
      ordreSections.value = r.ordreSections ?? []
    }
    catch { /* préférences indisponibles : on reste sur les valeurs par défaut */ }
    if (import.meta.client) {
      try {
        recents.value = JSON.parse(localStorage.getItem(CLE_RECENTS) ?? '[]')
      }
      catch { recents.value = [] }
    }
  }

  async function enregistrer(patch: { epingles?: string[], ordreSections?: string[] }) {
    try {
      await api('/api/preferences', { method: 'PUT', body: patch })
    }
    catch { /* échec silencieux : l'affichage local reste cohérent */ }
  }

  // --- Épingles -----------------------------------------------------------------------
  const estEpinglee = (url: string) => epingles.value.includes(url)
  async function basculerEpingle(url: string) {
    epingles.value = estEpinglee(url)
      ? epingles.value.filter(u => u !== url)
      : [...epingles.value, url]
    await enregistrer({ epingles: epingles.value })
  }

  // --- Ordre des sections --------------------------------------------------------------
  // Les sections absentes de la préférence gardent leur ordre par défaut : l'ajout d'une
  // nouvelle section n'invalide donc jamais un réglage existant.
  function ordonner<T extends { id: string }>(sections: T[]): T[] {
    if (!ordreSections.value.length) return sections
    const rang = new Map(ordreSections.value.map((id, i) => [id, i]))
    return [...sections].sort((a, b) => (rang.get(a.id) ?? 999) - (rang.get(b.id) ?? 999))
  }
  async function definirOrdre(ids: string[]) {
    ordreSections.value = ids
    await enregistrer({ ordreSections: ids })
  }

  // --- Récents (navigateur) ------------------------------------------------------------
  function noterVisite(page: PageConnue) {
    if (!import.meta.client) return
    const sansDoublon = recents.value.filter(r => r.url !== page.url)
    recents.value = [page, ...sansDoublon].slice(0, MAX_RECENTS)
    try {
      localStorage.setItem(CLE_RECENTS, JSON.stringify(recents.value))
    }
    catch { /* quota / navigation privée : sans effet */ }
  }

  return { epingles, ordreSections, recents, charger, estEpinglee, basculerEpingle, ordonner, definirOrdre, noterVisite }
}
