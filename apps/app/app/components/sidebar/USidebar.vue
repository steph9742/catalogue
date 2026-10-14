<script setup lang="ts">
import { SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupItem, SidebarItem, SidebarSection } from '@catalogue/ui'
import USidebarUser from './USidebarUser.vue'
import { type Item, SECTIONS } from '~/utils/navigation'

// Menu piloté par les DONNÉES (et non par un long gabarit) : c'est ce qui permet l'épinglage,
// l'ordre réglable par l'utilisateur et les sous-groupes sans dupliquer le rendu.
const session = await useSSRAuth()
const route = useRoute()
const perms = await usePermissions()
const prefs = useNavPrefs()
// Cadres actifs : chargés une fois, partagés par le menu, le plan du site et la palette.
await useCadres().charger()
await prefs.charger()

const isAdmin = computed(() => session.value?.user?.role === 'admin')
const isManager = perms.isManager
const isContributor = perms.isContributor
const canRead = (cat: string) => perms.canRead(cat)
const isActive = (path: string) => route.path === path || route.path.startsWith(path + '/')

const { demandes: demandesCount, alertes: alertesCount, refresh: refreshBadges } = useBadges()
await refreshBadges()
watch(() => route.path, () => {
  refreshBadges()
})

const badgeCls = 'ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white'

// LE MENU EST DÉCLARÉ DANS `utils/navigation.ts` : le titre de l'onglet le lit aussi.

// --- Filtrage par droits ---------------------------------------------------------------
const autorise = (i: Item) => {
  if (i.admin) return isAdmin.value
  if (i.manager) return isAdmin.value || isManager.value
  if (i.contributeurOuPlus) return isManager.value || isContributor.value
  if (i.cats) return i.cats.some(canRead)
  if (i.cat) return canRead(i.cat)
  return true
}

// --- Filtrage par cadre de référence -----------------------------------------------------
// Distinct des droits, et sans rapport avec eux : les droits disent CE QUE cette personne peut
// voir, le cadre dit ce que l'ÉTABLISSEMENT suit.
const { actif: cadreActif } = useCadres()

const sectionsVisibles = computed(() => {
  const retenu = (i: Item) => autorise(i) && cadreActif(i.cadre)
  const filtrees = SECTIONS
    .map(s => ({ ...s, groupes: s.groupes.map(g => ({ ...g, items: g.items.filter(retenu) })).filter(g => g.items.length) }))
    .filter(s => s.groupes.length)
  return prefs.ordonner(filtrees)
})

// Toutes les entrées visibles, à plat : sert aux épingles et aux récents.
const toutesLesEntrees = computed(() => sectionsVisibles.value.flatMap(s => s.groupes.flatMap(g => g.items)))

// --- Épingles & récents ------------------------------------------------------------------
const epinglees = computed(() => prefs.epingles.value
  .map(url => toutesLesEntrees.value.find(i => i.url === url))
  .filter(Boolean) as Item[])

const recentsAffiches = computed(() => prefs.recents.value
  .filter(r => !prefs.epingles.value.includes(r.url) && toutesLesEntrees.value.some(i => i.url === r.url))
  .slice(0, 4))

// Mémorise la page visitée (hors accueil) pour la section « Récents ».
watch(() => route.path, (p) => {
  const item = toutesLesEntrees.value.find(i => i.url === p)
  if (item) prefs.noterVisite({ libelle: item.libelle, url: item.url, icon: item.icon })
}, { immediate: true })

// --- Pliage des sections (A) --------------------------------------------------------------
// Repliées par DÉFAUT : l'état est ensuite mémorisé par utilisateur dans le navigateur, et
// la section de la page courante s'ouvre systématiquement.
const STORAGE_KEY = 'catalogue.sidebar.collapsed.v2'
const open = reactive<Record<string, boolean>>({})

function ensureActiveOpen() {
  for (const s of sectionsVisibles.value) {
    if (s.groupes.some(g => g.items.some(i => isActive(i.url)))) open[s.id] = true
  }
}
function toggle(id: string) {
  open[id] = !open[id]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(open))
  }
  catch { /* ignore */ }
}
onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(open, JSON.parse(raw))
  }
  catch { /* ignore */ }
  ensureActiveOpen()
})
watch(() => route.path, ensureActiveOpen)

const badgeDe = (i: Item) => (i.badge === 'demandes' ? demandesCount.value : i.badge === 'alertes' ? alertesCount.value : 0)
</script>

<template>
  <SidebarHeader class="pb-4">
    <div class="flex items-center gap-2 px-2">
      <div class="w-8 h-8 rounded-lg bg-primary-600 shadow-md shadow-primary-500/20 flex items-center justify-center">
        <Icon
          name="lucide:library-big"
          class="text-white w-5 h-5"
        />
      </div>
      <h1 class="text-xl font-bold font-sans tracking-tight text-secondary-900">
        Catalogue
      </h1>
    </div>
  </SidebarHeader>

  <SidebarContent>
    <!-- Recherche : point d'entrée visible dans le menu lui-même. -->
    <SidebarSection>
      <!-- Le déclencheur de recherche vivait ici ET dans la barre du haut. Un seul subsiste, dans la barre du haut, qui est collante : la recherche globale est atteignable partout sans être proposée deux fois. -->
    </SidebarSection>

    <SidebarSection>
      <SidebarItem :active="route.path === '/'">
        <NuxtLink href="/"><Icon name="lucide:layout-dashboard" /> Tableau de bord</NuxtLink>
      </SidebarItem>
    </SidebarSection>

    <!-- (B) Épinglés : les pages du quotidien, choisies par l'utilisateur. -->
    <SidebarSection v-if="epinglees.length">
      <span class="px-1 text-xs font-medium text-gray-700 font-sans">Épinglés</span>
      <SidebarGroup>
        <div
          v-for="i in epinglees"
          :key="'ep' + i.url"
          class="group/item relative"
        >
          <SidebarGroupItem :active="isActive(i.url)">
            <NuxtLink
              :href="i.url"
              class="pr-8"
            ><Icon :name="i.icon" /> {{ i.libelle }}</NuxtLink>
          </SidebarGroupItem>
          <button
            class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-primary-600 transition-colors hover:bg-primary-100"
            title="Retirer des épinglés"
            @click.prevent.stop="prefs.basculerEpingle(i.url)"
          >
            <Icon
              name="lucide:pin-off"
              class="size-3.5"
            />
          </button>
        </div>
      </SidebarGroup>
    </SidebarSection>

    <!-- (B) Récents : automatique, propre à cet appareil. -->
    <SidebarSection v-if="recentsAffiches.length">
      <span class="px-1 text-xs font-medium text-gray-700 font-sans">Récents</span>
      <SidebarGroup>
        <SidebarGroupItem
          v-for="r in recentsAffiches"
          :key="'rc' + r.url"
          :active="isActive(r.url)"
        >
          <NuxtLink :href="r.url"><Icon :name="r.icon" /> {{ r.libelle }}</NuxtLink>
        </SidebarGroupItem>
      </SidebarGroup>
    </SidebarSection>

    <!-- Sections : repliées par défaut (A), ordre réglable (D), sous-groupes (C). -->
    <SidebarSection
      v-for="s in sectionsVisibles"
      :key="s.id"
    >
      <button
        type="button"
        class="flex items-center gap-1.5 w-full px-1 py-0.5 rounded-lg hover:bg-gray-100 transition-colors group"
        @click="toggle(s.id)"
      >
        <Icon
          name="lucide:chevron-right"
          class="w-3.5 h-3.5 text-gray-500 transition-transform duration-150"
          :class="open[s.id] ? 'rotate-90' : ''"
        />
        <span class="text-xs font-medium text-gray-700 font-sans group-hover:text-gray-900">{{ s.titre }}</span>
      </button>

      <template v-if="open[s.id]">
        <div
          v-for="(g, gi) in s.groupes"
          :key="s.id + gi"
          class="space-y-1"
        >
          <span
            v-if="g.label"
            class="block px-2 pt-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-gray-400"
          >{{ g.label }}</span>
          <SidebarGroup>
            <div
              v-for="i in g.items"
              :key="i.url"
              class="group/item relative"
            >
              <SidebarGroupItem :active="isActive(i.url)">
                <NuxtLink
                  v-if="!i.externe"
                  :href="i.url"
                  class="pr-8"
                >
                  <Icon :name="i.icon" /> {{ i.libelle }}
                  <span
                    v-if="badgeDe(i)"
                    :class="badgeCls"
                    class="mr-4"
                    :style="{ backgroundColor: i.badge === 'alertes' ? '#ef4444' : undefined }"
                  >{{ badgeDe(i) }}</span>
                </NuxtLink>
                <NuxtLink
                  v-else
                  external
                  :href="i.url"
                  class="pr-8"
                ><Icon :name="i.icon" /> {{ i.libelle }}</NuxtLink>
              </SidebarGroupItem>
              <button
                v-if="!i.externe"
                class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-secondary-300 opacity-0 transition-all hover:bg-secondary-200 hover:text-secondary-600 focus:opacity-100 group-hover/item:opacity-100"
                :class="prefs.estEpinglee(i.url) ? '!text-primary-600 opacity-100' : ''"
                :title="prefs.estEpinglee(i.url) ? 'Retirer des épinglés' : 'Épingler en haut du menu'"
                @click.prevent.stop="prefs.basculerEpingle(i.url)"
              >
                <Icon
                  :name="prefs.estEpinglee(i.url) ? 'lucide:pin-off' : 'lucide:pin'"
                  class="size-3.5"
                />
              </button>
            </div>
          </SidebarGroup>
        </div>
      </template>
    </SidebarSection>
  </SidebarContent>

  <SidebarFooter>
    <USidebarUser :user="session?.user ?? null" />
  </SidebarFooter>
</template>
