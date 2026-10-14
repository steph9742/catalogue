<script setup lang="ts">
// PÉRIMÈTRES — l'entrée de la lecture TRANSVERSE du SI. Les catalogues répondent « quels
// serveurs ai-je ?

const api = useApi()
const perms = await usePermissions()

type Ligne = { id: string, nom: string, sousTitre: string | null, total: number, horsSupport: number, cle: string }
type Perimetres = { composantes: Ligne[], services: Ligne[], departements: Ligne[], lieux: Ligne[] }

const { data: p } = await useAsyncData('perimetres', () => api<Perimetres>('/api/perimetres'), { getCachedData: () => undefined })

const AXES = [
  { cle: 'composantes', titre: 'Composantes', icon: 'lucide:building', base: '/composantes', cat: 'composantes', aide: 'Le découpage de l\'établissement' },
  { cle: 'departements', titre: 'Départements', icon: 'lucide:graduation-cap', base: '/departements', cat: 'departements', aide: 'Les départements d\'enseignement et de recherche' },
  { cle: 'services', titre: 'Services', icon: 'lucide:layers', base: '/services', cat: 'services', aide: 'Les services administratifs et techniques' },
  { cle: 'lieux', titre: 'Lieux', icon: 'lucide:map-pin', base: '/lieux', cat: 'lieux', aide: 'Sites, bâtiments, salles et baies' },
] as const

// On n'affiche un axe que si l'utilisateur peut le lire ET qu'il porte des actifs.
const axes = computed(() =>
  AXES.filter(a => perms.canRead(a.cat)).map((a) => {
    const lignes = (p.value?.[a.cle as keyof Perimetres] ?? []).filter(l => l.total > 0)
    return { ...a, lignes, max: Math.max(1, ...lignes.map(l => l.total)), vides: (p.value?.[a.cle as keyof Perimetres] ?? []).length - lignes.length }
  }).filter(a => a.lignes.length || a.vides))

// Recherche locale : avec 27 composantes et 264 lieux, filtrer est plus rapide que défiler.
const recherche = ref('')
const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const filtrer = (lignes: Ligne[]) => {
  const q = normaliser(recherche.value.trim())
  return q ? lignes.filter(l => normaliser(l.nom).includes(q) || normaliser(l.sousTitre ?? '').includes(q)) : lignes
}

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Périmètres
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Le SI vu par périmètre plutôt que par type d'objet. Ouvrez-en un pour voir tout ce qu'il porte.
        </p>
      </div>
      <input
        v-model="recherche"
        placeholder="Filtrer…"
        :class="[CHAMP, 'sm:w-56']"
      >
    </header>

    <section
      v-for="a in axes"
      :key="a.cle"
      :class="[TUILE, 'space-y-2']"
    >
      <h2 class="flex flex-wrap items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          :name="a.icon"
          class="size-4 text-primary-500"
        />{{ a.titre }}
        <span class="text-xs font-normal text-secondary-400">{{ a.aide }}</span>
        <NuxtLink
          :to="a.base"
          class="ml-auto text-xs text-primary-600 hover:underline"
        >Catalogue</NuxtLink>
      </h2>

      <p
        v-if="!filtrer(a.lignes).length"
        class="px-1 py-2 text-xs text-secondary-400"
      >
        {{ recherche ? 'Aucun résultat pour ce filtre.' : 'Aucun périmètre ne porte encore d\'actif.' }}
      </p>

      <NuxtLink
        v-for="l in filtrer(a.lignes).slice(0, 12)"
        :key="l.id"
        :to="`${a.base}/${l.id}`"
        class="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary-50"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm text-secondary-800">{{ l.nom }}</span>
          <span
            v-if="l.sousTitre"
            class="block truncate text-[11px] text-secondary-400"
          >{{ l.sousTitre }}</span>
        </span>
        <!-- Machines hors support du périmètre : même calcul que la page « Fin de vie ».
             Absent quand tout va bien — un zéro partout ne serait que du bruit. -->
        <span
          v-if="l.horsSupport"
          class="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
          :title="`${l.horsSupport} machine(s) dont le système n'est plus supporté`"
        >
          <Icon
            name="lucide:shield-x"
            class="size-3"
          />{{ l.horsSupport }}
        </span>
        <span class="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-secondary-100 sm:w-28">
          <span
            class="block h-full rounded-full bg-primary-400"
            :style="{ width: `${(l.total / a.max) * 100}%` }"
          />
        </span>
        <span class="w-14 shrink-0 text-right font-mono text-xs font-semibold text-secondary-600">{{ l.total }}</span>
      </NuxtLink>

      <p
        v-if="filtrer(a.lignes).length > 12"
        class="px-2 text-xs text-secondary-400"
      >
        12 affichés sur {{ filtrer(a.lignes).length }} —
        <NuxtLink
          :to="a.base"
          class="text-primary-600 hover:underline"
        >voir tout le catalogue</NuxtLink>
      </p>
      <p
        v-if="a.vides"
        class="px-2 text-[11px] text-secondary-400"
      >
        {{ a.vides }} sans actif rattaché (non affichés).
      </p>
    </section>

    <p
      v-if="!axes.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucun périmètre accessible. Les périmètres se remplissent en rattachant les actifs à une composante, un service, un département ou un lieu — automatiquement à la synchronisation GLPI.
    </p>
  </div>
</template>
