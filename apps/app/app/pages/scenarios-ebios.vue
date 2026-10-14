<script setup lang="ts">
import { risqueGravites, risqueVraisemblances, labelOf } from '~/utils/catalogueEnums'

// Scénarios EBIOS RM : stratégiques (atelier 3) groupés par source de risque, dépliables vers
// leurs scénarios opérationnels (atelier 4).

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('scenarios-strategiques')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
const editable = computed(() => perms.canWrite('scenarios-strategiques'))

type Strat = {
  id: string
  nom: string
  gravite: string | null
  cheminAttaque: string | null
  sourceRisque: string | null
  sourceRisquePertinence: string | null
  evenementRedoute: string | null
  partiePrenante: string | null
  nbOperationnels: number
}
type Ope = { id: string, nom: string, vraisemblance: string | null, sequence: string | null, modeOperatoire: string | null, bienSupport: string | null }
type Synthese = {
  sourcesRisque: { total: number, retenues: number, aSurveiller: number }
  scenariosStrategiques: number
  scenariosOperationnels: number
  partiesPrenantes: { total: number, zones: { danger: number, controle: number, veille: number, negligeable: number, non_evaluee: number } }
}

const { data: scenarios } = await useAsyncData('scenarios-strat', () => api<Strat[]>('/api/ebios/scenarios-strategiques'), { getCachedData: () => undefined })
const { data: synth } = await useAsyncData('ebios-synthese', () => api<Synthese>('/api/ebios/synthese'), { getCachedData: () => undefined })

// Regroupement par source de risque (la maille de l'analyse EBIOS).
const groupes = computed(() => {
  const m = new Map<string, { titre: string, items: Strat[] }>()
  for (const s of scenarios.value ?? []) {
    const titre = s.sourceRisque ?? 'Sans source de risque'
    const e = m.get(titre) ?? { titre, items: [] }
    e.items.push(s)
    m.set(titre, e)
  }
  return [...m.values()].sort((a, b) => a.titre.localeCompare(b.titre))
})

// Chargement paresseux des scénarios opérationnels au dépliage.
const ouverts = reactive<Record<string, boolean>>({})
const opes = reactive<Record<string, Ope[]>>({})
const chargement = ref('')
const basculer = async (s: Strat) => {
  ouverts[s.id] = !ouverts[s.id]
  if (ouverts[s.id] && !opes[s.id]) {
    chargement.value = s.id
    try {
      opes[s.id] = await api<Ope[]>(`/api/scenarios-strategiques/${s.id}/operationnels`)
    }
    finally {
      chargement.value = ''
    }
  }
}

const GRAVITE_TONE: Record<string, string> = {
  mineure: 'border-secondary-200 bg-secondary-50 text-secondary-600',
  significative: 'border-amber-200 bg-amber-50 text-amber-700',
  grave: 'border-orange-200 bg-orange-50 text-orange-700',
  critique: 'border-red-200 bg-red-50 text-red-700',
}
const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Scénarios EBIOS RM
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Stratégiques (atelier 3) et opérationnels (atelier 4), par source de risque.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          to="/ecosysteme"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
        >
          <Icon
            name="lucide:share-2"
            class="size-4"
          /> Écosystème
        </NuxtLink>
        <NuxtLink
          v-if="editable"
          to="/scenarios-strategiques/new"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Scénario
        </NuxtLink>
      </div>
    </header>

    <section
      v-if="synth"
      class="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <div
        v-for="t in [
          { label: 'Sources retenues', n: synth.sourcesRisque.retenues, sub: `/ ${synth.sourcesRisque.total} sources`, icon: 'lucide:crosshair' },
          { label: 'Parties en danger', n: synth.partiesPrenantes.zones.danger, sub: `/ ${synth.partiesPrenantes.total} parties`, icon: 'lucide:share-2' },
          { label: 'Sc. stratégiques', n: synth.scenariosStrategiques, sub: 'atelier 3', icon: 'lucide:route' },
          { label: 'Sc. opérationnels', n: synth.scenariosOperationnels, sub: 'atelier 4', icon: 'lucide:binary' },
        ]"
        :key="t.label"
        :class="[TUILE, 'flex items-center gap-3']"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-primary-50">
          <Icon
            :name="t.icon"
            class="size-4 text-primary-600"
          />
        </span>
        <span>
          <span class="block text-xl font-semibold leading-none tracking-tight text-secondary-900">{{ t.n }}</span>
          <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
          <span class="block text-[10px] text-secondary-400">{{ t.sub }}</span>
        </span>
      </div>
    </section>

    <section
      v-if="!scenarios?.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucun scénario stratégique. <NuxtLink
        v-if="editable"
        to="/scenarios-strategiques/new"
        class="text-primary-600 hover:underline"
      >Créez-en un</NuxtLink> à partir d'une source de risque retenue et d'un événement redouté.
    </section>

    <section
      v-for="g in groupes"
      :key="g.titre"
      :class="[TUILE, 'space-y-1']"
    >
      <h2 class="mb-2 flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          name="lucide:crosshair"
          class="size-4 text-primary-500"
        />{{ g.titre }}
        <span class="ml-auto font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">{{ g.items.length }} scénario(s)</span>
      </h2>

      <div
        v-for="s in g.items"
        :key="s.id"
        class="rounded-lg border border-secondary-100"
      >
        <div class="flex flex-wrap items-center gap-2 px-3 py-2">
          <button
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-secondary-400 transition-colors hover:bg-secondary-100 hover:text-secondary-700"
            :title="ouverts[s.id] ? 'Replier' : 'Voir les scénarios opérationnels'"
            @click="basculer(s)"
          >
            <Icon
              name="lucide:chevron-right"
              class="size-4 transition-transform"
              :class="ouverts[s.id] ? 'rotate-90' : ''"
            />
          </button>
          <span
            v-if="s.gravite"
            class="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
            :class="GRAVITE_TONE[s.gravite]"
          >{{ labelOf(risqueGravites, s.gravite) }}</span>
          <NuxtLink
            :to="`/scenarios-strategiques/${s.id}`"
            class="text-sm font-medium text-secondary-800 hover:underline"
          >{{ s.nom }}</NuxtLink>
          <span class="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-secondary-400">
            <span
              v-if="s.evenementRedoute"
              class="inline-flex items-center gap-1"
            ><Icon
              name="lucide:siren"
              class="size-3"
            />{{ s.evenementRedoute }}</span>
            <span
              v-if="s.partiePrenante"
              class="inline-flex items-center gap-1"
            ><Icon
              name="lucide:share-2"
              class="size-3"
            />via {{ s.partiePrenante }}</span>
            <span
              v-else
              class="inline-flex items-center gap-1 text-secondary-300"
            ><Icon
              name="lucide:arrow-right"
              class="size-3"
            />chemin direct</span>
          </span>
          <span class="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wide text-secondary-400">{{ s.nbOperationnels }} op.</span>
        </div>

        <div
          v-if="ouverts[s.id]"
          class="border-t border-secondary-100 bg-secondary-50/40 px-3 py-2"
        >
          <p
            v-if="chargement === s.id"
            class="py-2 text-center font-mono text-xs text-secondary-400"
          >
            Chargement…
          </p>
          <p
            v-else-if="!opes[s.id]?.length"
            class="flex items-center justify-between py-1 text-xs text-secondary-500"
          >
            Aucun scénario opérationnel.
            <NuxtLink
              v-if="editable"
              to="/scenarios-operationnels/new"
              class="text-primary-600 hover:underline"
            >Ajouter</NuxtLink>
          </p>
          <template v-else>
            <div
              v-for="o in opes[s.id]"
              :key="o.id"
              class="flex flex-wrap items-center gap-2 rounded-md px-1 py-1.5 hover:bg-white"
            >
              <Icon
                name="lucide:binary"
                class="size-3.5 shrink-0 text-secondary-400"
              />
              <span
                v-if="o.vraisemblance"
                class="inline-flex shrink-0 items-center rounded border border-secondary-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-secondary-600"
              >V : {{ labelOf(risqueVraisemblances, o.vraisemblance) }}</span>
              <NuxtLink
                :to="`/scenarios-operationnels/${o.id}`"
                class="text-[13px] text-secondary-700 hover:underline"
              >{{ o.nom }}</NuxtLink>
              <span
                v-if="o.bienSupport"
                class="font-mono text-[10px] uppercase tracking-wide text-secondary-400"
              >sur {{ o.bienSupport }}</span>
            </div>
          </template>
        </div>
      </div>
    </section>

    <p
      v-if="synth && synth.sourcesRisque.aSurveiller"
      class="text-center text-xs text-secondary-400"
    >
      {{ synth.sourcesRisque.aSurveiller }} source(s) de risque à surveiller —
      <NuxtLink
        to="/sources-risque"
        class="text-primary-600 hover:underline"
      >gérer les sources de risque</NuxtLink>.
    </p>
  </div>
</template>
