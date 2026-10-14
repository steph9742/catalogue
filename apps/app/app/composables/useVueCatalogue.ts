import { computed, ref, watch } from 'vue'
import type { CatalogueConfig } from '~/utils/catalogues'

// MODE D'AFFICHAGE ET COLONNES, mémorisés par catalogue et par utilisateur.

export type ModeVue = 'cartes' | 'tableau'

type Reglage = { mode?: string, colonnes?: string[] }

export function useVueCatalogue(config: CatalogueConfig) {
  const api = useApi()
  // Partagé entre les listes : une seule lecture des préférences par session.
  const tous = useState<Record<string, Reglage>>('vues-catalogues', () => ({}))
  const charge = useState<boolean>('vues-catalogues-charge', () => false)

  const mode = ref<ModeVue>('cartes')
  // Colonnes candidates : tout sauf la clé naturelle, déjà portée par la colonne « Nom ».
  const colonnesPossibles = computed(() =>
    config.columns.filter(c => c.key !== config.naturalKey).map(c => ({ key: c.key, label: c.label })))
  // Par défaut : les quatre premières. Au-delà, le tableau devient illisible sans que
  // l'utilisateur ait rien demandé.
  const colonnesParDefaut = () => colonnesPossibles.value.slice(0, 4).map(c => c.key)
  const colonnes = ref<string[]>(colonnesParDefaut())

  const appliquer = () => {
    const r = tous.value[config.key]
    if (r?.mode === 'tableau' || r?.mode === 'cartes') mode.value = r.mode
    // On filtre sur les colonnes qui existent ENCORE : une colonne supprimée du catalogue
    // depuis le dernier enregistrement ne doit pas casser l'affichage.
    const valides = (r?.colonnes ?? []).filter(k => colonnesPossibles.value.some(c => c.key === k))
    if (valides.length) colonnes.value = valides
  }

  const charger = async () => {
    if (charge.value) {
      appliquer()
      return
    }
    try {
      const r = await api<{ vuesCatalogues?: Record<string, Reglage> }>('/api/preferences')
      tous.value = r.vuesCatalogues ?? {}
    }
    catch { /* préférences indisponibles : on garde les valeurs par défaut */ }
    finally {
      charge.value = true
      appliquer()
    }
  }

  let enregistrement: ReturnType<typeof setTimeout> | null = null
  const enregistrer = () => {
    // Regroupé : cocher cinq colonnes d'affilée ne doit pas produire cinq écritures.
    if (enregistrement) clearTimeout(enregistrement)
    enregistrement = setTimeout(async () => {
      tous.value = { ...tous.value, [config.key]: { mode: mode.value, colonnes: colonnes.value } }
      try {
        await api('/api/preferences', { method: 'PUT', body: { vuesCatalogues: tous.value } })
      }
      catch { /* l'affichage reste correct pour la session en cours */ }
    }, 400)
  }

  watch([mode, colonnes], enregistrer, { deep: true })

  const basculerColonne = (cle: string) => {
    colonnes.value = colonnes.value.includes(cle)
      ? colonnes.value.filter(k => k !== cle)
      : [...colonnes.value, cle] // ajoutée en fin : l'ordre de sélection fait l'ordre affiché
  }
  const deplacerColonne = (cle: string, sens: -1 | 1) => {
    const i = colonnes.value.indexOf(cle)
    const j = i + sens
    if (i < 0 || j < 0 || j >= colonnes.value.length) return
    const copie = [...colonnes.value]
    ;[copie[i], copie[j]] = [copie[j]!, copie[i]!]
    colonnes.value = copie
  }
  const reinitialiser = () => {
    colonnes.value = colonnesParDefaut()
  }

  return { mode, colonnes, colonnesPossibles, charger, basculerColonne, deplacerColonne, reinitialiser }
}
