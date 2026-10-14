<script setup lang="ts">
// Palette de recherche globale. Ouverte au clavier (Cmd/Ctrl + K) OU par le bouton « Rechercher
// » de la barre supérieure — la recherche accélère la navigation, elle ne la remplace jamais :
// le menu et les pages d'index restent les chemins de référence.
const api = useApi()
const perms = await usePermissions()
const route = useRoute()

const ouvert = defineModel<boolean>('open', { default: false })

type Resultat = { id: string, libelle: string, type: string, icon: string, url: string, cat: string }
type Entree = { libelle: string, sousTitre: string, icon: string, url: string }

const terme = ref('')
const resultats = ref<Resultat[]>([])
const chargement = ref(false)
const index = ref(0)
const champ = ref<HTMLInputElement | null>(null)

// --- Pages de l'app : navigables sans connaître le nom d'une fiche -------------------
const PAGES: { libelle: string, url: string, icon: string, cat?: string, admin?: boolean }[] = [
  { libelle: 'Tableau de bord', url: '/', icon: 'lucide:layout-dashboard' },
  { libelle: 'Applications', url: '/applications', icon: 'lucide:app-window', cat: 'applications' },
  { libelle: 'Serveurs', url: '/serveurs', icon: 'lucide:server', cat: 'serveurs' },
  { libelle: 'Postes de travail', url: '/postes-travail', icon: 'lucide:monitor', cat: 'postes-travail' },
  { libelle: 'Appareils mobiles', url: '/appareils-mobiles', icon: 'lucide:tablet-smartphone', cat: 'appareils-mobiles' },
  { libelle: 'IoT & objets connectés', url: '/iot', icon: 'lucide:cctv', cat: 'iot' },
  { libelle: 'Périmètres', url: '/perimetres', icon: 'lucide:scan-search' },
  { libelle: 'Fin de vie des systèmes', url: '/fin-de-vie', icon: 'lucide:shield-x', cat: 'technologies' },
  { libelle: 'Composantes', url: '/composantes', icon: 'lucide:building', cat: 'composantes' },
  { libelle: 'Annuaire', url: '/annuaire', icon: 'lucide:contact', cat: 'personnes' },
  { libelle: 'Organigramme', url: '/organigramme', icon: 'lucide:git-fork', cat: 'entites' },
  { libelle: 'Matrice des risques', url: '/matrice-risques', icon: 'lucide:grid-3x3', cat: 'risques-smsi' },
  { libelle: 'Écosystème (EBIOS)', url: '/ecosysteme', icon: 'lucide:share-2', cat: 'parties-prenantes' },
  { libelle: 'Scénarios EBIOS', url: '/scenarios-ebios', icon: 'lucide:route', cat: 'scenarios-strategiques' },
  { libelle: 'Mesures (SoA)', url: '/mesures-smsi', icon: 'lucide:list-checks', cat: 'mesures-smsi' },
  { libelle: 'Tableau de bord SMSI', url: '/tableau-smsi', icon: 'lucide:gauge', cat: 'mesures-smsi' },
  { libelle: 'Exigences NIS 2', url: '/exigences-nis2', icon: 'lucide:clipboard-check', cat: 'exigences-nis2' },
  { libelle: 'Plan d\'actions NIS 2', url: '/plan-actions-nis2', icon: 'lucide:list-todo', cat: 'actions-nis2' },
  { libelle: 'Notifications d\'incidents NIS 2', url: '/notifications-nis2', icon: 'lucide:bell-ring', cat: 'notifications-nis2' },
  { libelle: 'Mon entité (NIS 2)', url: '/entite-nis2', icon: 'lucide:shield', cat: 'exigences-nis2' },
  { libelle: 'Catalogue RGPD', url: '/rgpd', icon: 'lucide:shield', cat: 'applications' },
  { libelle: 'Toutes les pages', url: '/plan-du-site', icon: 'lucide:compass' },
  { libelle: 'Connecteur GLPI', url: '/glpi', icon: 'lucide:database-zap', admin: true },
  { libelle: 'Incidents (Slowpoke)', url: '/incidents', icon: 'lucide:siren', admin: true },
  { libelle: 'Utilisateurs & rôles', url: '/roles', icon: 'lucide:users', admin: true },
  { libelle: 'Référentiels', url: '/referentiels', icon: 'lucide:library', admin: true },
  { libelle: 'Journal d\'audit', url: '/audit', icon: 'lucide:scroll-text', admin: true },
  { libelle: 'API', url: '/documentation-api', icon: 'lucide:plug' },
  { libelle: 'Réglages', url: '/reglages', icon: 'lucide:settings', admin: true },
  { libelle: 'Mon profil', url: '/profil', icon: 'lucide:user-round' },
]

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const pagesVisibles = computed(() => PAGES.filter(p =>
  (!p.admin || perms.isAdmin.value) && (!p.cat || perms.canRead(p.cat))))

const pagesTrouvees = computed<Entree[]>(() => {
  const q = normaliser(terme.value.trim())
  const source = pagesVisibles.value
  const liste = q ? source.filter(p => normaliser(p.libelle).includes(q)) : source.slice(0, 8)
  return liste.slice(0, 8).map(p => ({ libelle: p.libelle, sousTitre: 'Page', icon: p.icon, url: p.url }))
})

const fichesTrouvees = computed<Entree[]>(() =>
  resultats.value.map(r => ({ libelle: r.libelle, sousTitre: r.type, icon: r.icon, url: r.url })))

const entrees = computed<Entree[]>(() => [...pagesTrouvees.value, ...fichesTrouvees.value])

// --- Recherche serveur (débattue) ----------------------------------------------------
let minuteur: ReturnType<typeof setTimeout> | undefined
watch(terme, (q) => {
  index.value = 0
  if (minuteur) clearTimeout(minuteur)
  if (q.trim().length < 2) {
    resultats.value = []
    return
  }
  chargement.value = true
  minuteur = setTimeout(async () => {
    try {
      const r = await api<{ resultats: Resultat[] }>(`/api/recherche?q=${encodeURIComponent(q.trim())}`)
      resultats.value = r.resultats
    }
    catch { resultats.value = [] }
    finally { chargement.value = false }
  }, 220)
})

// --- Ouverture / fermeture -----------------------------------------------------------
watch(ouvert, async (o) => {
  if (o) {
    terme.value = ''
    resultats.value = []
    index.value = 0
    await nextTick()
    champ.value?.focus()
  }
})
watch(() => route.fullPath, () => {
  ouvert.value = false
})

const aller = (e: Entree) => {
  ouvert.value = false
  navigateTo(e.url)
}

const auClavier = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') {
    ouvert.value = false
    return
  }
  if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    index.value = Math.min(index.value + 1, entrees.value.length - 1)
  }
  else if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    index.value = Math.max(index.value - 1, 0)
  }
  else if (ev.key === 'Enter') {
    const e = entrees.value[index.value]
    if (e) aller(e)
  }
}

// Raccourci global Cmd/Ctrl + K.
const raccourci = (ev: KeyboardEvent) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault()
    ouvert.value = !ouvert.value
  }
}
onMounted(() => window.addEventListener('keydown', raccourci))
onUnmounted(() => {
  window.removeEventListener('keydown', raccourci)
  if (minuteur) clearTimeout(minuteur)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ouvert"
      class="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6"
    >
      <div
        class="absolute inset-0 bg-secondary-950/40"
        @click="ouvert = false"
      />

      <div class="relative mt-[8vh] w-full max-w-xl overflow-hidden rounded-2xl border border-secondary-200 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div class="flex items-center gap-2 border-b border-secondary-100 px-4">
          <Icon
            name="lucide:search"
            class="size-4 shrink-0 text-secondary-400"
          />
          <input
            ref="champ"
            v-model="terme"
            type="search"
            placeholder="Rechercher une fiche ou une page…"
            class="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-secondary-400"
            @keydown="auClavier"
          >
          <Icon
            v-if="chargement"
            name="lucide:loader-circle"
            class="size-4 shrink-0 animate-spin text-secondary-300"
          />
          <button
            class="shrink-0 rounded-md px-2 py-1 text-[11px] text-secondary-400 transition-colors hover:bg-secondary-100"
            @click="ouvert = false"
          >
            Échap
          </button>
        </div>

        <div class="max-h-[60vh] overflow-y-auto p-2">
          <p
            v-if="!entrees.length"
            class="px-3 py-6 text-center text-sm text-secondary-400"
          >
            {{ terme.trim().length < 2 ? 'Tapez au moins 2 caractères.' : 'Aucun résultat.' }}
          </p>

          <template v-else>
            <p
              v-if="pagesTrouvees.length"
              class="px-3 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400"
            >
              Pages
            </p>
            <button
              v-for="(e, i) in pagesTrouvees"
              :key="'p' + e.url"
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
              :class="index === i ? 'bg-primary-50 text-primary-800' : 'hover:bg-secondary-50'"
              @click="aller(e)"
              @mouseenter="index = i"
            >
              <Icon
                :name="e.icon"
                class="size-4 shrink-0 text-secondary-400"
              />
              <span class="min-w-0 flex-1 truncate text-sm">{{ e.libelle }}</span>
              <span class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-secondary-400">{{ e.sousTitre }}</span>
            </button>

            <p
              v-if="fichesTrouvees.length"
              class="px-3 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400"
            >
              Fiches
            </p>
            <button
              v-for="(e, i) in fichesTrouvees"
              :key="'f' + e.url"
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
              :class="index === pagesTrouvees.length + i ? 'bg-primary-50 text-primary-800' : 'hover:bg-secondary-50'"
              @click="aller(e)"
              @mouseenter="index = pagesTrouvees.length + i"
            >
              <Icon
                :name="e.icon"
                class="size-4 shrink-0 text-secondary-400"
              />
              <span class="min-w-0 flex-1 truncate text-sm">{{ e.libelle }}</span>
              <span class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-secondary-400">{{ e.sousTitre }}</span>
            </button>
          </template>
        </div>

        <div class="hidden items-center gap-3 border-t border-secondary-100 bg-secondary-50/60 px-4 py-2 text-[11px] text-secondary-400 sm:flex">
          <span><kbd class="rounded border border-secondary-200 bg-white px-1">↑</kbd> <kbd class="rounded border border-secondary-200 bg-white px-1">↓</kbd> naviguer</span>
          <span><kbd class="rounded border border-secondary-200 bg-white px-1">↵</kbd> ouvrir</span>
          <NuxtLink
            to="/plan-du-site"
            class="ml-auto text-primary-600 hover:underline"
            @click="ouvert = false"
          >Voir toutes les pages</NuxtLink>
        </div>
      </div>
    </div>
  </Teleport>
</template>
