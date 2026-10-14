<script setup lang="ts">
import { reactive } from 'vue'
import { labelOf, composanteTypes, departementTypes, poleTypes } from '~/utils/catalogueEnums'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const api = useApi()
const load = async (e: string) => {
  const { data } = await useAsyncData(`org-${e}`, () => api<Row[]>(`/api/${e}`), { getCachedData: () => undefined })
  return data
}
const entites = await load('entites')
const composantes = await load('composantes')
const departements = await load('departements')
const services = await load('services')
const poles = await load('poles')
const personnes = await load('personnes')
const gouvernance = await load('entite-responsables')

const personName = (id: string | null | undefined) => {
  if (!id) return null
  const p = (personnes.value ?? []).find(x => x.id === id)
  return p ? `${p.prenom ? p.prenom + ' ' : ''}${p.nom}`.trim() : null
}
const composantesOf = (entiteId: string) => (composantes.value ?? []).filter(c => c.entiteId === entiteId)
const departementsOf = (composanteId: string) => (departements.value ?? []).filter(d => d.composanteId === composanteId)
const servicesOf = (composanteId: string) => (services.value ?? []).filter(s => s.composanteId === composanteId)
const polesOf = (serviceId: string) => (poles.value ?? []).filter(p => p.serviceId === serviceId)

// Gouvernance groupée par entité.
const ROLE_LABELS: Record<string, string> = { president: 'Président·e', vice_president: 'VP', chef_cabinet: 'Chef cab.', secretaire_cabinet: 'Secr. cab.', dgs: 'DGS', dga: 'DGA' }
const ROLE_ORDER = ['president', 'vice_president', 'chef_cabinet', 'secretaire_cabinet', 'dgs', 'dga']
const govOf = (entiteId: string) => (gouvernance.value ?? [])
  .filter(g => g.entiteId === entiteId)
  .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || (a.ordre ?? 0) - (b.ordre ?? 0))
  .map(g => ({ id: g.id, personneId: g.personneId, name: `${g.prenom ? g.prenom + ' ' : ''}${g.nom ?? ''}`.trim(), role: ROLE_LABELS[g.role] ?? g.role }))

// Personnes rattachées à l'unité la plus fine.
const personsByUnit = computed(() => {
  const m = new Map<string, Row[]>()
  for (const p of personnes.value ?? []) {
    const unit = p.poleId ?? p.departementId ?? p.serviceId ?? p.composanteId
    if (!unit) continue
    const g = m.get(unit) ?? []
    g.push(p)
    m.set(unit, g)
  }
  return m
})
const personsOf = (unitId: string) => personsByUnit.value.get(unitId) ?? []

const exp = reactive(new Set<string>())
const toggle = (id: string) => {
  if (exp.has(id)) exp.delete(id)
  else exp.add(id)
}
const allIds = computed(() => [...(entites.value ?? []), ...(composantes.value ?? []), ...(departements.value ?? []), ...(services.value ?? []), ...(poles.value ?? [])].map(x => x.id))
const expandAll = () => {
  for (const id of allIds.value) exp.add(id)
}
const collapseAll = () => exp.clear()

const view = ref<'arbre' | 'graphe'>('arbre')
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5 p-6 animate-in fade-in duration-500">
    <header class="relative overflow-hidden rounded-2xl border border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40 p-6 shadow-sm">
      <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div class="absolute -right-12 -top-16 size-52 rounded-full bg-primary-300/20 blur-3xl" />
      </div>
      <div class="relative flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="flex size-11 items-center justify-center rounded-2xl border border-primary-200/60 bg-white text-primary-600 shadow-sm">
            <Icon
              name="lucide:git-fork"
              class="size-6"
            />
          </div>
          <div>
            <UITitle class="tracking-tight text-secondary-900">
              Organigramme
            </UITitle>
            <p class="mt-0.5 text-sm text-secondary-600/90">
              Cartographie humaine — responsables mis en avant.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1 rounded-xl border border-secondary-200 bg-white p-1 shadow-sm">
          <button
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="view === 'arbre' ? 'bg-primary-600 text-white' : 'text-secondary-600 hover:bg-secondary-50'"
            @click="view = 'arbre'"
          >
            <Icon
              name="lucide:list-tree"
              class="mb-0.5 mr-1 inline size-4"
            />Arbre
          </button>
          <button
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            :class="view === 'graphe' ? 'bg-primary-600 text-white' : 'text-secondary-600 hover:bg-secondary-50'"
            @click="view = 'graphe'"
          >
            <Icon
              name="lucide:workflow"
              class="mb-0.5 mr-1 inline size-4"
            />Graphe
          </button>
        </div>
      </div>
    </header>

    <div
      v-if="entites?.length && view === 'arbre'"
      class="flex justify-end gap-2 text-sm"
    >
      <button
        class="rounded-lg border border-secondary-200 bg-white px-3 py-1.5 text-secondary-600 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-600"
        @click="expandAll"
      >
        Tout déplier
      </button>
      <button
        class="rounded-lg border border-secondary-200 bg-white px-3 py-1.5 text-secondary-600 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-600"
        @click="collapseAll"
      >
        Tout replier
      </button>
    </div>

    <div
      v-if="!entites?.length"
      class="rounded-2xl border border-secondary-200/50 bg-secondary-50/30 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
        <Icon
          name="lucide:landmark"
          class="size-7 text-primary-600"
        />
      </div>
      <p class="font-medium text-secondary-600">
        Aucune entité.
      </p>
    </div>

    <!-- VUE GRAPHE (interactive, drill-down jusqu'aux personnes) -->
    <template v-else-if="view === 'graphe'">
      <p class="flex items-center gap-1.5 text-xs text-secondary-500">
        <Icon
          name="lucide:info"
          class="size-3.5"
        /> Cliquez un nœud pour déplier/replier · molette pour zoomer · glissez pour vous déplacer.
      </p>
      <OrgGraph
        :entites="entites ?? []"
        :composantes="composantes ?? []"
        :departements="departements ?? []"
        :services="services ?? []"
        :poles="poles ?? []"
        :personnes="personnes ?? []"
        :gouvernance="gouvernance ?? []"
      />
    </template>

    <!-- VUE ARBRE -->
    <template v-else>
      <div
        v-for="e in entites"
        :key="e.id"
        class="space-y-2"
      >
        <button
          class="flex w-full items-center gap-3 rounded-2xl border border-primary-200/60 bg-linear-to-br from-primary-50/80 to-background p-4 text-left shadow-sm transition-colors hover:border-primary-300"
          @click="toggle(e.id)"
        >
          <Icon
            name="lucide:chevron-right"
            class="size-4 shrink-0 text-primary-400 transition-transform"
            :class="exp.has(e.id) ? 'rotate-90' : ''"
          />
          <div class="flex size-9 items-center justify-center rounded-xl border border-primary-200/60 bg-white text-primary-600 shadow-sm">
            <Icon
              name="lucide:landmark"
              class="size-5"
            />
          </div>
          <span class="font-semibold text-secondary-900">{{ e.nom }}</span>
          <span
            v-if="e.sigle"
            class="rounded bg-secondary-100 px-1.5 py-0.5 font-mono text-[11px] text-secondary-500"
          >{{ e.sigle }}</span>
          <span class="ml-auto text-xs text-secondary-400">{{ composantesOf(e.id).length }} composantes</span>
        </button>

        <div
          v-if="exp.has(e.id)"
          class="space-y-2 border-l-2 border-primary-200/50 pl-4"
        >
          <!-- Gouvernance de l'entité -->
          <div
            v-if="govOf(e.id).length"
            class="rounded-xl border border-primary-200/50 bg-primary-50/40 p-3"
          >
            <div class="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-primary-600">
              <Icon
                name="lucide:crown"
                class="size-3.5"
              /> Gouvernance
            </div>
            <div class="flex flex-wrap gap-1.5">
              <NuxtLink
                v-for="m in govOf(e.id)"
                :key="m.id"
                :to="`/personnes/${m.personneId}`"
                class="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-white px-2 py-0.5 text-xs text-secondary-700 transition-colors hover:border-primary-300"
              >
                <span class="font-semibold text-primary-600">{{ m.role }}</span> {{ m.name }}
              </NuxtLink>
            </div>
          </div>

          <div
            v-if="!composantesOf(e.id).length"
            class="py-1 text-sm text-secondary-400"
          >
            Aucune composante.
          </div>
          <div
            v-for="c in composantesOf(e.id)"
            :key="c.id"
            class="space-y-2"
          >
            <button
              class="flex w-full flex-wrap items-center gap-2 rounded-xl border border-secondary-200/70 bg-white p-3 text-left shadow-sm transition-colors hover:border-primary-300"
              @click="toggle(c.id)"
            >
              <Icon
                name="lucide:chevron-right"
                class="size-4 shrink-0 text-secondary-400 transition-transform"
                :class="exp.has(c.id) ? 'rotate-90' : ''"
              />
              <Icon
                name="lucide:building"
                class="size-4 text-accent-500"
              />
              <span class="font-medium text-secondary-900">{{ c.nom }}</span>
              <span class="rounded-md border border-accent-200/60 bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">{{ labelOf(composanteTypes, c.type) }}</span>
              <span
                v-if="personName(c.directeurId)"
                class="inline-flex items-center gap-1 rounded-md border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] text-secondary-600"
              ><span class="text-secondary-400">Dir.</span> {{ personName(c.directeurId) }}</span>
              <span
                v-if="personName(c.viceDirecteurId)"
                class="inline-flex items-center gap-1 rounded-md border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] text-secondary-600"
              ><span class="text-secondary-400">Vice-dir.</span> {{ personName(c.viceDirecteurId) }}</span>
              <span
                v-if="personName(c.rsaId)"
                class="inline-flex items-center gap-1 rounded-md border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] text-secondary-600"
              ><span class="text-secondary-400">RSA</span> {{ personName(c.rsaId) }}</span>
              <span class="ml-auto text-xs text-secondary-400">{{ servicesOf(c.id).length + departementsOf(c.id).length }} unités</span>
            </button>

            <div
              v-if="exp.has(c.id)"
              class="space-y-2 border-l-2 border-accent-200/50 pl-4"
            >
              <OrgPersons
                v-if="personsOf(c.id).length"
                :persons="personsOf(c.id)"
              />

              <div
                v-for="d in departementsOf(c.id)"
                :key="d.id"
                class="space-y-2"
              >
                <button
                  class="flex w-full flex-wrap items-center gap-2 rounded-lg border border-secondary-200/70 bg-secondary-50/40 p-2.5 text-left text-sm transition-colors hover:border-primary-300 hover:bg-white"
                  @click="toggle(d.id)"
                >
                  <Icon
                    name="lucide:chevron-right"
                    class="size-4 shrink-0 text-secondary-400 transition-transform"
                    :class="exp.has(d.id) ? 'rotate-90' : ''"
                  />
                  <Icon
                    name="lucide:graduation-cap"
                    class="size-4 text-emerald-500"
                  />
                  <span class="font-medium text-secondary-800">{{ d.nom }}</span>
                  <span class="rounded border border-secondary-200 bg-white px-1.5 py-0.5 text-[11px] text-secondary-500">{{ labelOf(departementTypes, d.type) }}</span>
                  <span
                    v-if="personName(d.directeurId)"
                    class="inline-flex items-center gap-1 rounded-md border border-secondary-200 bg-white px-1.5 py-0.5 text-[10px] text-secondary-600"
                  ><span class="text-secondary-400">Dir.</span> {{ personName(d.directeurId) }}</span>
                  <span
                    v-if="personName(d.secretaireId)"
                    class="inline-flex items-center gap-1 rounded-md border border-secondary-200 bg-white px-1.5 py-0.5 text-[10px] text-secondary-600"
                  ><span class="text-secondary-400">Secr.</span> {{ personName(d.secretaireId) }}</span>
                  <span class="ml-auto text-xs text-secondary-400">{{ personsOf(d.id).length }} pers.</span>
                </button>
                <div
                  v-if="exp.has(d.id)"
                  class="border-l-2 border-secondary-200/60 pl-4"
                >
                  <OrgPersons :persons="personsOf(d.id)" />
                </div>
              </div>

              <div
                v-for="s in servicesOf(c.id)"
                :key="s.id"
                class="space-y-2"
              >
                <button
                  class="flex w-full flex-wrap items-center gap-2 rounded-lg border border-secondary-200/70 bg-secondary-50/40 p-2.5 text-left text-sm transition-colors hover:border-primary-300 hover:bg-white"
                  @click="toggle(s.id)"
                >
                  <Icon
                    name="lucide:chevron-right"
                    class="size-4 shrink-0 text-secondary-400 transition-transform"
                    :class="exp.has(s.id) ? 'rotate-90' : ''"
                  />
                  <Icon
                    name="lucide:layers"
                    class="size-4 text-blue-500"
                  />
                  <span class="font-medium text-secondary-800">{{ s.nom }}</span>
                  <span
                    v-if="s.central"
                    class="rounded border border-primary-200/60 bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700"
                  >Central</span>
                  <span
                    v-if="personName(s.directeurId)"
                    class="inline-flex items-center gap-1 rounded-md border border-secondary-200 bg-white px-1.5 py-0.5 text-[10px] text-secondary-600"
                  ><span class="text-secondary-400">Dir.</span> {{ personName(s.directeurId) }}</span>
                  <span class="ml-auto text-xs text-secondary-400">{{ polesOf(s.id).length }} pôles · {{ personsOf(s.id).length }} pers.</span>
                </button>
                <div
                  v-if="exp.has(s.id)"
                  class="space-y-2 border-l-2 border-secondary-200/60 pl-4"
                >
                  <OrgPersons
                    v-if="personsOf(s.id).length"
                    :persons="personsOf(s.id)"
                  />
                  <div
                    v-for="p in polesOf(s.id)"
                    :key="p.id"
                  >
                    <button
                      class="flex w-full flex-wrap items-center gap-2 rounded-lg border border-secondary-200 bg-white p-2 text-left text-xs transition-colors hover:border-primary-300"
                      @click="toggle(p.id)"
                    >
                      <Icon
                        name="lucide:chevron-right"
                        class="size-3.5 shrink-0 text-secondary-400 transition-transform"
                        :class="exp.has(p.id) ? 'rotate-90' : ''"
                      />
                      <Icon
                        name="lucide:network"
                        class="size-3.5 text-primary-500"
                      />
                      <span class="font-medium text-secondary-700">{{ p.nom }}</span>
                      <span class="rounded bg-secondary-100 px-1 text-[10px] text-secondary-500">{{ labelOf(poleTypes, p.type) }}</span>
                      <span
                        v-if="personName(p.responsableId)"
                        class="inline-flex items-center gap-1 rounded-md border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] text-secondary-600"
                      ><span class="text-secondary-400">Responsable</span> {{ personName(p.responsableId) }}</span>
                      <span class="ml-auto text-secondary-400">{{ personsOf(p.id).length }} pers.</span>
                    </button>
                    <div
                      v-if="exp.has(p.id)"
                      class="border-l-2 border-primary-200/50 pl-4 pt-2"
                    >
                      <OrgPersons :persons="personsOf(p.id)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
