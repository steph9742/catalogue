<script setup lang="ts">
// Vue PIVOT d'un périmètre — « qu'est-ce que j'ai ici ? ».
const props = defineProps<{
  type: 'composante' | 'service' | 'departement' | 'lieu'
  id: string
  retour: { label: string, url: string }
  editable?: boolean
}>()

const api = useApi()

type Bloc = { cle: string, label: string, icon: string, base: string, data: { total: number, items: { id: string, nom: string }[] } }
type Perimetre = {
  type: string
  cible: { id: string, nom: string, sousTitre: string | null, sigle: string | null, sousLieux: number }
  blocs: Bloc[]
  total: number
  limite: number
  posture: { aClasser: number, obsoletes: number, serveursHorsGlpi: number }
  finDeSupport: { total: number, items: { id: string, nom: string, base: string, os: string | null, finDeVie: string | null }[] }
}

const { data: p } = await useAsyncData(
  `perimetre-${props.type}-${props.id}`,
  () => api<Perimetre>(`/api/perimetre/${props.type}/${props.id}`),
  { getCachedData: () => undefined },
)

// LE NOM DE L'UNITÉ DANS L'ONGLET : le titre dérivé du menu nomme l'axe (« Services »),
// pas l'unité ouverte — et une fiche de périmètre se consulte à plusieurs onglets.
useHead({ title: () => p.value?.cible.nom })

const blocsRemplis = computed(() => (p.value?.blocs ?? []).filter(b => b.data.total > 0))
const blocsVides = computed(() => (p.value?.blocs ?? []).filter(b => b.data.total === 0))

// Points d'attention : seulement ce qui est non nul (pas de tuile à zéro).
const pointsAttention = computed(() => {
  const s = p.value?.posture
  if (!s) return []
  return [
    { n: s.aClasser, label: 'machine(s) GLPI à classer', icon: 'lucide:help-circle' },
    { n: s.obsoletes, label: 'machine(s) en fin de support', icon: 'lucide:shield-x', ancre: '#fin-de-support' },
    { n: s.serveursHorsGlpi, label: 'serveur(s) hors inventaire GLPI', icon: 'lucide:server-off' },
  ].filter(x => x.n > 0)
})

const finDeSupport = computed(() => p.value?.finDeSupport ?? { total: 0, items: [] })

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <NuxtLink
          :to="retour.url"
          class="inline-flex items-center gap-1 text-xs text-secondary-500 hover:text-primary-600"
        >
          <Icon
            name="lucide:arrow-left"
            class="size-3.5"
          /> {{ retour.label }}
        </NuxtLink>
        <UITitle class="mt-1 tracking-tight text-secondary-900">
          {{ p?.cible.nom }}
          <span
            v-if="p?.cible.sigle"
            class="ml-1 text-base font-normal text-secondary-400"
          >({{ p.cible.sigle }})</span>
        </UITitle>
        <p class="mt-1 truncate text-sm text-secondary-600/90">
          <span v-if="p?.cible.sousTitre">{{ p.cible.sousTitre }} · </span>
          {{ p?.total ?? 0 }} élément(s) rattaché(s)
          <span
            v-if="p?.cible.sousLieux"
            class="text-secondary-400"
          > · {{ p.cible.sousLieux }} emplacement(s) inclus</span>
        </p>
      </div>
      <NuxtLink
        v-if="editable"
        :to="`${retour.url}/${id}/edit`"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
      >
        <Icon
          name="lucide:pencil"
          class="size-4"
        /> Modifier
      </NuxtLink>
    </header>

    <slot name="avant" />

    <!-- Posture du périmètre -->
    <!-- La couverture EDR du périmètre. `lieu` en est exclu : le chemin d'entité GLPI
         porte l'organisation, pas la géographie, et un lieu n'y a pas de segment. -->
    <CouvertureEdr
      v-if="type !== 'lieu'"
      :id="id"
      :niveau="type"
    />

    <section
      v-if="pointsAttention.length"
      class="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <component
        :is="a.ancre ? 'a' : 'div'"
        v-for="a in pointsAttention"
        :key="a.label"
        :href="a.ancre"
        :class="[TUILE, 'flex items-center gap-3 !border-amber-200/70', a.ancre ? 'transition-all hover:-translate-y-0.5 hover:shadow-md' : '']"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50">
          <Icon
            :name="a.icon"
            class="size-4 text-amber-600"
          />
        </span>
        <span class="min-w-0">
          <span class="block text-xl font-semibold leading-none tracking-tight text-amber-700">{{ a.n }}</span>
          <span class="mt-1 block text-[13px] leading-tight text-secondary-700">{{ a.label }}</span>
        </span>
        <Icon
          v-if="a.ancre"
          name="lucide:chevron-down"
          class="ml-auto size-4 shrink-0 text-amber-500"
        />
      </component>
    </section>

    <!-- Machines en fin de support du périmètre : le détail derrière le compteur. -->
    <section
      v-if="finDeSupport.total"
      id="fin-de-support"
      :class="[TUILE, 'space-y-2 scroll-mt-4 !border-red-200/70']"
    >
      <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          name="lucide:shield-x"
          class="size-4 text-red-500"
        /> Machines en fin de support
        <span class="ml-auto font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">{{ finDeSupport.total }}</span>
      </h2>
      <div
        v-for="m in finDeSupport.items"
        :key="m.base + m.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary-50"
      >
        <NuxtLink
          :to="`${m.base}/${m.id}`"
          class="min-w-[8rem] flex-1 truncate text-sm text-secondary-800 hover:text-primary-700 hover:underline"
        >{{ m.nom }}</NuxtLink>
        <span class="truncate font-mono text-[10px] text-secondary-400">{{ m.os }}</span>
        <span class="shrink-0 font-mono text-[10px] font-semibold text-red-600">fin {{ m.finDeVie }}</span>
      </div>
      <p
        v-if="finDeSupport.total > finDeSupport.items.length"
        class="px-2 text-xs text-secondary-400"
      >
        {{ finDeSupport.items.length }} affichée(s) sur {{ finDeSupport.total }} —
        <NuxtLink
          to="/fin-de-vie"
          class="text-primary-600 hover:underline"
        >voir la fin de vie des systèmes</NuxtLink>
      </p>
    </section>

    <!-- Compteurs par type -->
    <section
      v-if="blocsRemplis.length"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      <a
        v-for="b in blocsRemplis"
        :key="b.cle"
        :href="`#${b.cle}`"
        :class="[TUILE, 'flex items-center gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md']"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-primary-50">
          <Icon
            :name="b.icon"
            class="size-4 text-primary-600"
          />
        </span>
        <span class="min-w-0">
          <span class="block text-xl font-semibold leading-none tracking-tight text-secondary-900">{{ b.data.total }}</span>
          <span class="mt-1 block truncate text-[11px] text-secondary-500">{{ b.label }}</span>
        </span>
      </a>
    </section>

    <section
      v-if="!blocsRemplis.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucun élément rattaché à ce périmètre. Le rattachement se fait sur chaque fiche, ou automatiquement depuis GLPI à la synchronisation.
    </section>

    <slot name="apres" />

    <!-- Détail par type -->
    <section
      v-for="b in blocsRemplis"
      :id="b.cle"
      :key="b.cle"
      :class="[TUILE, 'space-y-2 scroll-mt-4']"
    >
      <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          :name="b.icon"
          class="size-4 text-primary-500"
        />{{ b.label }}
        <span class="ml-auto font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">{{ b.data.total }}</span>
      </h2>
      <div class="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="i in b.data.items"
          :key="i.id"
          :to="`${b.base}/${i.id}`"
          class="truncate rounded-lg px-2 py-1.5 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-primary-700"
        >
          {{ i.nom }}
        </NuxtLink>
      </div>
      <p
        v-if="b.data.total > b.data.items.length"
        class="px-2 text-xs text-secondary-400"
      >
        {{ b.data.items.length }} affiché(s) sur {{ b.data.total }} —
        <NuxtLink
          :to="b.base"
          class="text-primary-600 hover:underline"
        >voir tout le catalogue</NuxtLink>
      </p>
    </section>

    <p
      v-if="blocsVides.length"
      class="px-1 text-xs text-secondary-400"
    >
      Aucun élément pour : {{ blocsVides.map(b => b.label.toLowerCase()).join(', ') }}.
    </p>
  </div>
</template>
