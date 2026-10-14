<script setup lang="ts">
import { computed } from 'vue'
import { competenceNiveaux, labelOf } from '~/utils/catalogueEnums'

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('competences')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

type Cell = { id: string, personneId: string, nom: string, prenom: string | null, competenceId: string, competence: string, niveauRequis: string | null, niveau: string | null }
type Comp = { id: string, nom: string, niveauRequis: string | null }
const { data: matrice } = await useAsyncData('mat-comp', () => api<Cell[]>('/api/matrice-competences'), { getCachedData: () => undefined })
const { data: competences } = await useAsyncData('mat-comp-list', () => api<Comp[]>('/api/competences'), { getCachedData: () => undefined })

const ORDER = competenceNiveaux.map(n => n.value)
const rank = (n: string | null) => (n ? ORDER.indexOf(n) : -1)
const TONE: Record<string, string> = {
  notion: 'border-secondary-200 bg-secondary-50 text-secondary-600',
  intermediaire: 'border-blue-200 bg-blue-50 text-blue-700',
  confirme: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expert: 'border-primary-200 bg-primary-50 text-primary-700',
}

const colonnes = computed(() => (competences.value ?? []).slice().sort((a, b) => a.nom.localeCompare(b.nom)))
const lignes = computed(() => {
  const par = new Map<string, { nom: string, cells: Map<string, Cell> }>()
  for (const c of matrice.value ?? []) {
    const label = `${c.prenom ? c.prenom + ' ' : ''}${c.nom ?? ''}`.trim()
    const e = par.get(c.personneId) ?? { nom: label, cells: new Map() }
    e.cells.set(c.competenceId, c)
    par.set(c.personneId, e)
  }
  return [...par.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.nom.localeCompare(b.nom))
})
// Écart = niveau détenu inférieur au niveau requis par la compétence.
const ecart = (cell: Cell | undefined, requis: string | null) =>
  !!requis && rank(cell?.niveau ?? null) < rank(requis)
const nbEcarts = computed(() => colonnes.value.reduce((n, c) =>
  n + lignes.value.filter(l => ecart(l.cells.get(c.id), c.niveauRequis)).length, 0))
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Matrice des compétences
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        ISO 27001 clause 7.2 — {{ lignes.length }} personne(s) × {{ colonnes.length }} compétence(s)<span v-if="nbEcarts"> · <span class="font-medium text-amber-600">{{ nbEcarts }} écart(s) au niveau requis</span></span>.
      </p>
    </header>

    <section
      v-if="!colonnes.length || !lignes.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Déclarez des <NuxtLink
        to="/competences"
        class="text-primary-600 hover:underline"
      >compétences</NuxtLink>, puis affectez-les aux personnes depuis leur fiche.
    </section>

    <section
      v-else
      class="overflow-x-auto rounded-2xl border border-secondary-200/60 bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
    >
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-secondary-100 bg-secondary-50/60">
            <th class="sticky left-0 bg-secondary-50/60 px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
              Personne
            </th>
            <th
              v-for="c in colonnes"
              :key="c.id"
              class="whitespace-nowrap px-3 py-3 text-center font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500"
            >
              {{ c.nom }}
              <div
                v-if="c.niveauRequis"
                class="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-secondary-400"
              >
                requis : {{ labelOf(competenceNiveaux, c.niveauRequis) }}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="l in lignes"
            :key="l.id"
            class="border-t border-secondary-100 hover:bg-secondary-50/40"
          >
            <td class="sticky left-0 whitespace-nowrap bg-white px-4 py-2.5 font-medium text-secondary-900">
              <NuxtLink
                :to="`/personnes/${l.id}`"
                class="hover:text-primary-700"
              >{{ l.nom }}</NuxtLink>
            </td>
            <td
              v-for="c in colonnes"
              :key="c.id"
              class="px-3 py-2.5 text-center"
            >
              <span
                v-if="l.cells.get(c.id)?.niveau"
                class="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium"
                :class="[TONE[l.cells.get(c.id)!.niveau!] ?? TONE.notion, ecart(l.cells.get(c.id), c.niveauRequis) ? 'ring-1 ring-amber-400' : '']"
                :title="ecart(l.cells.get(c.id), c.niveauRequis) ? 'Inférieur au niveau requis' : ''"
              >{{ labelOf(competenceNiveaux, l.cells.get(c.id)!.niveau) }}</span>
              <span
                v-else
                class="text-secondary-300"
              >—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <p class="text-center text-xs text-secondary-400">
      Un liseré ambre signale un niveau inférieur au niveau requis par la compétence.
    </p>
  </div>
</template>
