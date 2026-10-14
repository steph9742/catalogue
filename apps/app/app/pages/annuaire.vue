<script setup lang="ts">
import CatalogueFilterBar from '~/components/catalogue/CatalogueFilterBar.vue'

type Row = {
  id: string
  nom: string
  prenom: string | null
  fonction: string | null
  email: string | null
  actif: boolean
  populationId: string | null
  populationNom: string | null
  composanteId: string | null
  composanteNom: string | null
  serviceId: string | null
  serviceNom: string | null
  referents: string[]
  missions: string[]
}
const api = useApi()
const { data: rows } = await useAsyncData('annuaire', () => api<Row[]>('/api/annuaire'), { getCachedData: () => undefined })

const search = ref('')
const active = ref<Record<string, (string | number)[]>>({})

const uniq = (arr: (string | null)[]) => [...new Set(arr.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b))
const opts = (arr: string[]) => arr.map(v => ({ value: v, label: v }))
const filterDefs = computed(() => [
  { key: 'population', label: 'Population', options: opts(uniq((rows.value ?? []).map(r => r.populationNom))) },
  { key: 'composante', label: 'Composante', options: opts(uniq((rows.value ?? []).map(r => r.composanteNom))) },
  { key: 'service', label: 'Service', options: opts(uniq((rows.value ?? []).map(r => r.serviceNom))) },
  { key: 'referent', label: 'Référent de', options: opts(uniq((rows.value ?? []).flatMap(r => r.referents))) },
  { key: 'mission', label: 'Rôle / mission', options: opts(uniq((rows.value ?? []).flatMap(r => r.missions))) },
])

const fullName = (r: Row) => `${r.prenom ? r.prenom + ' ' : ''}${r.nom}`.trim()
const sel = (k: string) => (active.value[k] ?? []).map(String)
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const P = sel('population'), C = sel('composante'), S = sel('service'), R = sel('referent'), M = sel('mission')
  return (rows.value ?? []).filter((r) => {
    if (P.length && !P.includes(r.populationNom ?? '')) return false
    if (C.length && !C.includes(r.composanteNom ?? '')) return false
    if (S.length && !S.includes(r.serviceNom ?? '')) return false
    if (R.length && !r.referents.some(x => R.includes(x))) return false
    if (M.length && !r.missions.some(x => M.includes(x))) return false
    if (q && ![fullName(r), r.fonction, r.email, r.composanteNom, r.serviceNom, ...r.referents, ...r.missions].filter(Boolean).join(' ').toLowerCase().includes(q)) return false
    return true
  })
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="relative overflow-hidden rounded-2xl border border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40 p-6 shadow-sm">
      <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div class="absolute -right-12 -top-16 size-52 rounded-full bg-primary-300/20 blur-3xl" />
      </div>
      <div class="relative flex items-center gap-3">
        <div class="flex size-11 items-center justify-center rounded-2xl border border-primary-200/60 bg-white text-primary-600 shadow-sm">
          <Icon
            name="lucide:contact"
            class="size-6"
          />
        </div>
        <div>
          <UITitle class="tracking-tight text-secondary-900">
            Annuaire
          </UITitle>
          <p class="mt-0.5 text-sm text-secondary-600/90">
            Qui fait quoi — personnes, rattachements, référents et rôles.
          </p>
        </div>
      </div>
    </header>

    <CatalogueFilterBar
      v-model:search="search"
      v-model:active="active"
      :filters="filterDefs"
      :placeholder="`Rechercher parmi ${rows?.length ?? 0} personnes…`"
    />

    <div class="text-sm text-secondary-500">
      <strong class="text-secondary-800">{{ filtered.length }}</strong> personne{{ filtered.length > 1 ? 's' : '' }}
    </div>

    <div
      v-if="!filtered.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucune personne pour ces critères.
    </div>
    <ul
      v-else
      class="grid grid-cols-1 gap-2.5 md:grid-cols-2"
    >
      <li
        v-for="r in filtered"
        :key="r.id"
      >
        <NuxtLink
          :to="`/personnes/${r.id}`"
          class="group flex h-full flex-col gap-2 rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)]"
        >
          <div class="flex items-start gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full border border-secondary-100 bg-secondary-50 text-secondary-500"><Icon
              name="lucide:user-round"
              class="size-5"
            /></div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium text-secondary-900 group-hover:text-primary-900">{{ fullName(r) }}</span>
                <span
                  v-if="!r.actif"
                  class="rounded bg-secondary-100 px-1.5 text-[10px] font-semibold uppercase text-secondary-500"
                >Inactif</span>
              </div>
              <p
                v-if="r.fonction"
                class="truncate text-xs text-secondary-500"
              >{{ r.fonction }}</p>
              <p
                v-if="r.composanteNom || r.serviceNom"
                class="mt-0.5 truncate text-xs text-secondary-400"
              >
                <Icon
                  name="lucide:building"
                  class="mb-0.5 inline size-3"
                /> {{ [r.composanteNom, r.serviceNom].filter(Boolean).join(' · ') }}
              </p>
              <span
                v-if="r.populationNom"
                class="mt-1 inline-block rounded border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] font-medium text-secondary-600"
              >{{ r.populationNom }}</span>
            </div>
          </div>
          <div
            v-if="r.referents.length || r.missions.length"
            class="flex flex-wrap gap-1.5"
          >
            <span
              v-for="t in r.referents"
              :key="'r' + t"
              class="rounded-md border border-primary-200/60 bg-primary-50/60 px-2 py-0.5 text-[11px] font-medium text-primary-700"
            >{{ t }}</span>
            <span
              v-for="t in r.missions"
              :key="'m' + t"
              class="rounded-md border border-accent-200/60 bg-accent-50/60 px-2 py-0.5 text-[11px] font-medium text-accent-700"
            >{{ t }}</span>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
