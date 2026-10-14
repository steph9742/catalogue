<script setup lang="ts">
import { computed } from 'vue'
import { mesureThemes, risqueVraisemblances, risqueGravites } from '~/utils/catalogueEnums'

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('mesures-smsi') && !perms.canRead('risques-smsi')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const load = async (e: string) => (await useAsyncData(`tb-${e}`, () => api<Row[]>(`/api/${e}`), { getCachedData: () => undefined })).data
const mesures = await load('mesures-smsi')
const risques = await load('risques-smsi')
const ncs = await load('non-conformites')
const objectifs = await load('objectifs-smsi')

// --- Couverture SoA -------------------------------------------------------------------
const applicables = computed(() => (mesures.value ?? []).filter(m => m.applicable))
const enOeuvre = computed(() => applicables.value.filter(m => m.statut === 'mise_en_oeuvre').length)
const couverture = computed(() => applicables.value.length ? Math.round((enOeuvre.value / applicables.value.length) * 100) : 0)
const parTheme = computed(() => risqueGraviteThemes())
function risqueGraviteThemes() {
  return mesureThemes.map((th) => {
    const list = applicables.value.filter(m => m.theme === th.value)
    const ok = list.filter(m => m.statut === 'mise_en_oeuvre').length
    return { label: th.label, total: list.length, ok, pct: list.length ? Math.round((ok / list.length) * 100) : 0 }
  })
}

// --- Risques (niveau = produit des indices vraisemblance × gravité) -------------------
const vOrder = risqueVraisemblances.map(o => o.value)
const gOrder = risqueGravites.map(o => o.value)
function niveau(v: string | null, g: string | null) {
  const vi = vOrder.indexOf(v ?? '')
  const gi = gOrder.indexOf(g ?? '')
  if (vi < 0 || gi < 0) return null
  const p = (vi + 1) * (gi + 1)
  return p <= 3 ? 'faible' : p <= 6 ? 'modere' : p <= 9 ? 'eleve' : 'critique'
}
const NIVEAUX = [
  { key: 'critique', label: 'Critique', cls: 'bg-red-500' },
  { key: 'eleve', label: 'Élevé', cls: 'bg-orange-500' },
  { key: 'modere', label: 'Modéré', cls: 'bg-amber-400' },
  { key: 'faible', label: 'Faible', cls: 'bg-emerald-500' },
]
const risqueParNiveau = computed(() => NIVEAUX.map(n => ({
  ...n,
  brut: (risques.value ?? []).filter(r => niveau(r.vraisemblance, r.gravite) === n.key).length,
  residuel: (risques.value ?? []).filter(r => niveau(r.vraisemblanceResiduelle, r.graviteResiduelle) === n.key).length,
})))
const risquesTotal = computed(() => (risques.value ?? []).length)
const risquesAcceptes = computed(() => (risques.value ?? []).filter(r => r.risqueAccepte).length)
const risquesNonEvalues = computed(() => (risques.value ?? []).filter(r => !niveau(r.vraisemblance, r.gravite)).length)

// --- NC & objectifs -------------------------------------------------------------------
const ncOuvertes = computed(() => (ncs.value ?? []).filter(n => n.statut === 'ouverte' || n.statut === 'en_cours').length)
const objAtteints = computed(() => (objectifs.value ?? []).filter(o => o.statut === 'atteint').length)

const tiles = computed(() => [
  { label: 'Couverture SoA', value: `${couverture.value}%`, sub: `${enOeuvre.value}/${applicables.value.length} mesures applicables`, icon: 'lucide:list-checks' },
  { label: 'Risques au registre', value: risquesTotal.value, sub: `${risquesAcceptes.value} résiduels acceptés`, icon: 'lucide:triangle-alert' },
  { label: 'Non-conformités ouvertes', value: ncOuvertes.value, sub: `${(ncs.value ?? []).length} au total`, icon: 'lucide:octagon-alert' },
  { label: 'Objectifs atteints', value: `${objAtteints.value}/${(objectifs.value ?? []).length}`, sub: 'objectifs de sécurité', icon: 'lucide:target' },
])
const maxNiveau = computed(() => Math.max(1, ...risqueParNiveau.value.map(n => Math.max(n.brut, n.residuel))))
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Tableau de bord SMSI
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Pilotage de la conformité ISO 27001 — couverture, risques, non-conformités.
      </p>
    </header>

    <section class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div
        v-for="t in tiles"
        :key="t.label"
        class="group relative overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)]"
      >
        <div class="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full bg-primary-200/25 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
        <div class="relative flex size-9 items-center justify-center rounded-xl border border-primary-100 bg-primary-50 text-primary-600">
          <Icon
            :name="t.icon"
            class="size-5"
          />
        </div>
        <div class="relative mt-3 text-3xl font-bold tracking-tight text-secondary-900">
          {{ t.value }}
        </div>
        <div class="relative mt-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-secondary-500">
          {{ t.label }}
        </div>
        <div class="relative mt-0.5 text-xs text-secondary-500">
          {{ t.sub }}
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
        <h2 class="mb-4 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">
          Couverture SoA par thème (Annexe A)
        </h2>
        <div class="space-y-3">
          <div
            v-for="th in parTheme"
            :key="th.label"
          >
            <div class="mb-1 flex items-center justify-between text-xs text-secondary-600">
              <span>{{ th.label }}</span><span class="font-medium">{{ th.ok }}/{{ th.total }} · {{ th.pct }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-secondary-100">
              <div
                class="h-full rounded-full bg-primary-500 transition-all"
                :style="{ width: th.pct + '%' }"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
        <h2 class="mb-4 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">
          Répartition des risques (brut vs résiduel)
        </h2>
        <div class="space-y-3">
          <div
            v-for="n in risqueParNiveau"
            :key="n.key"
          >
            <div class="mb-1 flex items-center justify-between text-xs text-secondary-600">
              <span>{{ n.label }}</span><span class="font-medium">brut {{ n.brut }} · résiduel {{ n.residuel }}</span>
            </div>
            <div class="flex items-center gap-1">
              <div
                class="h-2.5 rounded-full transition-all"
                :class="n.cls"
                :style="{ width: (n.brut / maxNiveau * 100) + '%', minWidth: n.brut ? '6px' : '0' }"
              />
            </div>
            <div class="mt-0.5 flex items-center gap-1">
              <div
                class="h-1.5 rounded-full opacity-50 transition-all"
                :class="n.cls"
                :style="{ width: (n.residuel / maxNiveau * 100) + '%', minWidth: n.residuel ? '6px' : '0' }"
              />
            </div>
          </div>
          <p
            v-if="risquesNonEvalues"
            class="pt-1 text-xs text-secondary-400"
          >
            {{ risquesNonEvalues }} risque(s) non évalué(s).
          </p>
        </div>
      </div>
    </section>

    <p class="text-center text-xs text-secondary-400">
      <NuxtLink
        to="/matrice-risques"
        class="hover:text-primary-600 hover:underline"
      >Matrice des risques</NuxtLink>
      · <NuxtLink
        to="/mesures-smsi"
        class="hover:text-primary-600 hover:underline"
      >SoA</NuxtLink>
      · <NuxtLink
        to="/non-conformites"
        class="hover:text-primary-600 hover:underline"
      >Non-conformités</NuxtLink>
    </p>
  </div>
</template>
