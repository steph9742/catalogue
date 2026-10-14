import { watch, type Ref } from 'vue'

// FILTRES DANS L'URL — l'état d'une liste (recherche, filtres, tri, page) vit dans l'adresse
// plutôt que dans la mémoire de l'onglet.

const RESERVES = ['q', 'tri', 'sens', 'page']

export function useListeUrl(etat: {
  search: Ref<string>
  filtres: Ref<Record<string, (string | number)[]>>
  triCle: Ref<string>
  triSens: Ref<'asc' | 'desc'>
  page: Ref<number>
}) {
  const route = useRoute()
  const router = useRouter()

  // --- URL → état (au chargement, et si l'utilisateur navigue dans l'historique) -------
  const lire = () => {
    const q = route.query
    if (typeof q.q === 'string') etat.search.value = q.q
    if (typeof q.tri === 'string') etat.triCle.value = q.tri
    if (q.sens === 'asc' || q.sens === 'desc') etat.triSens.value = q.sens
    if (typeof q.page === 'string' && Number(q.page) > 0) etat.page.value = Number(q.page)

    const filtres: Record<string, (string | number)[]> = {}
    for (const [cle, val] of Object.entries(q)) {
      if (RESERVES.includes(cle) || typeof val !== 'string' || !val) continue
      filtres[cle] = val.split(',')
    }
    if (Object.keys(filtres).length) etat.filtres.value = filtres
  }
  lire()

  // --- état → URL ---------------------------------------------------------------------
  const ecrire = () => {
    const q: Record<string, string> = {}
    if (etat.search.value.trim()) q.q = etat.search.value.trim()
    // Valeurs par défaut omises : une URL propre se lit et se partage mieux.
    if (etat.triCle.value && etat.triCle.value !== '__title') q.tri = etat.triCle.value
    if (etat.triSens.value !== 'asc') q.sens = etat.triSens.value
    if (etat.page.value > 1) q.page = String(etat.page.value)
    for (const [cle, vals] of Object.entries(etat.filtres.value)) {
      if (vals?.length) q[cle] = vals.map(String).join(',')
    }

    const avant = JSON.stringify(route.query)
    const apres = JSON.stringify(q)
    if (avant !== apres) void router.replace({ query: q })
  }

  watch(
    [etat.search, etat.filtres, etat.triCle, etat.triSens, etat.page],
    ecrire,
    { deep: true },
  )

  /** Lien absolu de la vue courante, à copier pour un collègue. */
  const lienPartageable = () =>
    (import.meta.client ? window.location.origin : '') + route.path
    + (Object.keys(route.query).length ? '?' + new URLSearchParams(route.query as Record<string, string>).toString() : '')

  return { lienPartageable }
}
