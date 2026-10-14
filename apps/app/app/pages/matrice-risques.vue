<script setup lang="ts">
import { computed } from 'vue'
import { risqueVraisemblances, risqueGravites, labelOf } from '~/utils/catalogueEnums'

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('risques-smsi')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

type Risque = {
  id: string
  nom: string
  vraisemblance?: string | null
  gravite?: string | null
  vraisemblanceResiduelle?: string | null
  graviteResiduelle?: string | null
  statut?: string | null
}
const { data: risques } = await useAsyncData('matrice-risques', () => api<Risque[]>('/api/risques-smsi'), { getCachedData: () => undefined })

// Bascule risque brut / risque résiduel (après traitement).
const mode = ref<'brut' | 'residuel'>('brut')
const vOf = (r: Risque) => (mode.value === 'residuel' ? r.vraisemblanceResiduelle : r.vraisemblance)
const gOf = (r: Risque) => (mode.value === 'residuel' ? r.graviteResiduelle : r.gravite)

// Ordre des échelles (index 0 = plus faible).
const vraisOrder = risqueVraisemblances.map(o => o.value)
const gravOrder = risqueGravites.map(o => o.value)

function band(vIdx: number, gIdx: number) {
  const p = (vIdx + 1) * (gIdx + 1)
  if (p <= 3) return { label: 'Faible', cls: 'bg-emerald-100 border-emerald-200 text-emerald-900' }
  if (p <= 6) return { label: 'Modéré', cls: 'bg-amber-100 border-amber-200 text-amber-900' }
  if (p <= 9) return { label: 'Élevé', cls: 'bg-orange-100 border-orange-200 text-orange-900' }
  return { label: 'Critique', cls: 'bg-red-100 border-red-200 text-red-900' }
}

// Grille : lignes = gravité décroissante (critique en haut), colonnes = vraisemblance croissante.
const grid = computed(() => [...gravOrder].reverse().map((g) => {
  const gIdx = gravOrder.indexOf(g)
  return {
    g,
    gLabel: labelOf(risqueGravites, g),
    cells: vraisOrder.map((v, vIdx) => ({
      key: `${v}-${g}`,
      band: band(vIdx, gIdx),
      risks: (risques.value ?? []).filter(r => vOf(r) === v && gOf(r) === g),
    })),
  }
}))

const nonEvalues = computed(() => (risques.value ?? []).filter(r => !vOf(r) || !gOf(r)))
const total = computed(() => (risques.value ?? []).length)
const legend = [
  { label: 'Faible', cls: 'bg-emerald-100 border-emerald-200' },
  { label: 'Modéré', cls: 'bg-amber-100 border-amber-200' },
  { label: 'Élevé', cls: 'bg-orange-100 border-orange-200' },
  { label: 'Critique', cls: 'bg-red-100 border-red-200' },
]
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Matrice des risques
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Vraisemblance × gravité — {{ total }} risque{{ total > 1 ? 's' : '' }} au registre.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div class="inline-flex rounded-lg border border-secondary-200 bg-secondary-50/60 p-0.5 text-xs font-medium">
          <button
            class="rounded-md px-2.5 py-1 transition-colors"
            :class="mode === 'brut' ? 'bg-white text-secondary-900 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'"
            @click="mode = 'brut'"
          >
            Risque brut
          </button>
          <button
            class="rounded-md px-2.5 py-1 transition-colors"
            :class="mode === 'residuel' ? 'bg-white text-secondary-900 shadow-sm' : 'text-secondary-500 hover:text-secondary-700'"
            @click="mode = 'residuel'"
          >
            Résiduel
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <div
            v-for="l in legend"
            :key="l.label"
            class="flex items-center gap-1.5 text-xs text-secondary-600"
          >
            <span
              class="inline-block size-3 rounded border"
              :class="l.cls"
            /> {{ l.label }}
          </div>
        </div>
      </div>
    </header>

    <section class="overflow-x-auto rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
      <div class="flex gap-2">
        <div class="flex items-center">
          <span class="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Gravité</span>
        </div>
        <div class="min-w-[520px] flex-1">
          <div
            v-for="row in grid"
            :key="row.g"
            class="flex gap-2"
          >
            <div class="flex w-24 shrink-0 items-center justify-end pr-1 text-right text-xs font-semibold text-secondary-600">
              {{ row.gLabel }}
            </div>
            <div class="grid flex-1 grid-cols-4 gap-2 pb-2">
              <div
                v-for="c in row.cells"
                :key="c.key"
                class="min-h-[86px] rounded-xl border p-2"
                :class="c.band.cls"
              >
                <div class="flex items-center justify-between">
                  <span class="text-lg font-bold leading-none">{{ c.risks.length }}</span>
                  <span class="text-[9px] font-semibold uppercase tracking-wide opacity-60">{{ c.band.label }}</span>
                </div>
                <div class="mt-1 space-y-0.5">
                  <NuxtLink
                    v-for="r in c.risks.slice(0, 3)"
                    :key="r.id"
                    :to="`/risques-smsi/${r.id}`"
                    class="block truncate rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-medium hover:bg-white"
                    :title="r.nom"
                  >{{ r.nom }}</NuxtLink>
                  <span
                    v-if="c.risks.length > 3"
                    class="block px-1.5 text-[10px] opacity-70"
                  >+{{ c.risks.length - 3 }} autre(s)</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <div class="w-24 shrink-0" />
            <div class="grid flex-1 grid-cols-4 gap-2">
              <div
                v-for="v in vraisOrder"
                :key="v"
                class="pt-1 text-center text-xs font-semibold text-secondary-600"
              >
                {{ labelOf(risqueVraisemblances, v) }}
              </div>
            </div>
          </div>
          <p class="mt-1 text-center text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
            Vraisemblance
          </p>
        </div>
      </div>
    </section>

    <section
      v-if="nonEvalues.length"
      class="rounded-2xl border border-dashed border-secondary-300 bg-secondary-50/40 p-4"
    >
      <p class="mb-2 text-sm font-medium text-secondary-700">
        {{ nonEvalues.length }} risque(s) non positionné(s) (vraisemblance ou gravité manquante)
      </p>
      <div class="flex flex-wrap gap-2">
        <NuxtLink
          v-for="r in nonEvalues"
          :key="r.id"
          :to="`/risques-smsi/${r.id}`"
          class="inline-flex items-center rounded-lg border border-secondary-200 bg-white px-2 py-1 text-xs hover:border-primary-300"
        >{{ r.nom }}</NuxtLink>
      </div>
    </section>
  </div>
</template>
