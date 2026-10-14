<script setup lang="ts">
import { partiePrenanteTypes, labelOf } from '~/utils/catalogueEnums'

// Cartographie de l'écosystème (EBIOS RM, atelier 3). Chaque partie prenante est positionnée
// par son niveau de menace = (dépendance × pénétration) / (maturité × confiance), calculé côté
// serveur.

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('parties-prenantes')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
const editable = computed(() => perms.canWrite('parties-prenantes'))

type Zone = 'danger' | 'controle' | 'veille' | 'negligeable' | 'non_evaluee'
type Partie = {
  id: string
  nom: string
  type: string | null
  description: string | null
  dependance: number | null
  penetration: number | null
  maturiteCyber: number | null
  confiance: number | null
  exposition: number
  fiabilite: number
  menace: number | null
  zone: Zone
}
const { data: parties } = await useAsyncData('ecosysteme', () => api<Partie[]>('/api/ebios/ecosysteme'), { getCachedData: () => undefined })

const ZONE = {
  danger: { label: 'Zone de danger', cls: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500', barre: 'bg-red-500' },
  controle: { label: 'Zone de contrôle', cls: 'border-orange-200 bg-orange-50 text-orange-700', dot: 'bg-orange-500', barre: 'bg-orange-400' },
  veille: { label: 'Zone de veille', cls: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', barre: 'bg-amber-400' },
  negligeable: { label: 'Négligeable', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', barre: 'bg-emerald-400' },
  non_evaluee: { label: 'Non évaluée', cls: 'border-secondary-200 bg-secondary-50 text-secondary-500', dot: 'bg-secondary-300', barre: 'bg-secondary-300' },
} as const
const ORDRE: Zone[] = ['danger', 'controle', 'veille', 'negligeable', 'non_evaluee']

const compteurs = computed(() => {
  const c = { danger: 0, controle: 0, veille: 0, negligeable: 0, non_evaluee: 0 } as Record<Zone, number>
  for (const p of parties.value ?? []) c[p.zone]++
  return c
})
// Tri par menace décroissante (les non évaluées en fin).
const triees = computed(() =>
  [...(parties.value ?? [])].sort((a, b) => (b.menace ?? -1) - (a.menace ?? -1)))
// Menace maxi pour dimensionner les barres (borne à 4 pour rester lisible).
const menaceMax = computed(() => Math.max(4, ...(parties.value ?? []).map(p => p.menace ?? 0)))

const critere = (v: number | null) => (v == null ? '—' : String(v))
const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Écosystème (EBIOS RM)
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Niveau de menace des parties prenantes = (dépendance × pénétration) / (maturité × confiance).
        </p>
      </div>
      <NuxtLink
        v-if="editable"
        to="/parties-prenantes/new"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
      >
        <Icon
          name="lucide:plus"
          class="size-4"
        /> Partie prenante
      </NuxtLink>
    </header>

    <section class="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <div
        v-for="z in ORDRE"
        :key="z"
        :class="[TUILE, 'flex items-center gap-3']"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-xl border"
          :class="ZONE[z].cls"
        >
          <span
            class="size-2.5 rounded-full"
            :class="ZONE[z].dot"
          />
        </span>
        <span>
          <span class="block text-xl font-semibold leading-none tracking-tight text-secondary-900">{{ compteurs[z] }}</span>
          <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ ZONE[z].label }}</span>
        </span>
      </div>
    </section>

    <section
      v-if="!parties?.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucune partie prenante. <NuxtLink
        v-if="editable"
        to="/parties-prenantes/new"
        class="text-primary-600 hover:underline"
      >Ajoutez-en une</NuxtLink> pour cartographier l'écosystème.
    </section>

    <section
      v-else
      :class="[TUILE, 'space-y-1 !p-2']"
    >
      <div
        v-for="p in triees"
        :key="p.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 transition-colors hover:bg-secondary-50"
      >
        <span
          class="inline-flex w-24 shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
          :class="ZONE[p.zone].cls"
        >
          <span
            class="size-2 rounded-full"
            :class="ZONE[p.zone].dot"
          /> {{ p.menace ?? '—' }}
        </span>
        <NuxtLink
          :to="`/parties-prenantes/${p.id}`"
          class="min-w-[10rem] flex-1 text-sm font-medium text-secondary-800 hover:underline"
        >
          {{ p.nom }}
          <span
            v-if="p.type"
            class="ml-1 font-mono text-[10px] uppercase tracking-wide text-secondary-400"
          >{{ labelOf(partiePrenanteTypes, p.type) }}</span>
        </NuxtLink>
        <span class="hidden shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-secondary-400 sm:flex">
          <span title="Dépendance">dép {{ critere(p.dependance) }}</span>
          <span title="Pénétration">pén {{ critere(p.penetration) }}</span>
          <span title="Maturité cyber">mat {{ critere(p.maturiteCyber) }}</span>
          <span title="Confiance">conf {{ critere(p.confiance) }}</span>
        </span>
        <span class="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-secondary-100">
          <span
            class="block h-full rounded-full"
            :class="ZONE[p.zone].barre"
            :style="{ width: `${Math.min(100, ((p.menace ?? 0) / menaceMax) * 100)}%` }"
          />
        </span>
      </div>
    </section>

    <p class="text-center text-xs text-secondary-400">
      Seuils : menace &gt; 3 zone de danger · &gt; 1,5 zone de contrôle · &gt; 0,75 zone de veille. Une partie prenante non évaluée n'a pas ses 4 critères renseignés.
    </p>
  </div>
</template>
