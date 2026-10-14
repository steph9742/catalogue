<script setup lang="ts">
import { ref, computed } from 'vue'

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('actifs-smsi')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

type Actif = { id: string, nom: string, categorie: string | null, typeSource: string | null }
type Edge = { id: string, actifId: string, supportId: string }
const { data: actifs } = await useAsyncData('dep-actifs', () => api<Actif[]>('/api/actifs-smsi'), { getCachedData: () => undefined })
const { data: edges } = await useAsyncData('dep-edges', () => api<Edge[]>('/api/actif-dependances'), { getCachedData: () => undefined })

const byId = computed(() => new Map((actifs.value ?? []).map(a => [a.id, a])))
// supportsOf(id) = ce dont id dépend ; dependentsOf(id) = ce qui dépend de id.
const supportsOf = (id: string) => (edges.value ?? []).filter(e => e.actifId === id).map(e => e.supportId)
const dependentsOf = (id: string) => (edges.value ?? []).filter(e => e.supportId === id).map(e => e.actifId)

// Arbre de supports aplati (DFS avec profondeur, garde anti-cycle).
function flattenSupports(rootId: string) {
  const out: { id: string, depth: number }[] = []
  const seen = new Set<string>()
  const walk = (id: string, depth: number) => {
    for (const s of supportsOf(id)) {
      if (seen.has(s)) continue
      seen.add(s)
      out.push({ id: s, depth })
      walk(s, depth + 1)
    }
  }
  walk(rootId, 0)
  return out
}

const primaires = computed(() => (actifs.value ?? []).filter(a => a.categorie === 'primaire' || supportsOf(a.id).length))

// Analyse d'impact : fermeture transitive des dépendants (ce qui tombe si X tombe).
const cible = ref('')
const impactes = computed(() => {
  if (!cible.value) return []
  const out = new Set<string>()
  const walk = (id: string) => {
    for (const d of dependentsOf(id)) {
      if (!out.has(d)) {
        out.add(d)
        walk(d)
      }
    }
  }
  walk(cible.value)
  return [...out].map(id => byId.value.get(id)).filter(Boolean) as Actif[]
})
const options = computed(() => (actifs.value ?? []).slice().sort((a, b) => a.nom.localeCompare(b.nom)))
const nom = (id: string) => byId.value.get(id)?.nom ?? '?'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Dépendances des actifs
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Cartographie ISO 27005 : valeurs métier et biens supports, propagation d'impact.
      </p>
    </header>

    <!-- Analyse d'impact -->
    <section class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
      <h2 class="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">
        Analyse d'impact — « si cet actif tombe, quoi d'autre est impacté ? »
      </h2>
      <select
        v-model="cible"
        class="w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:bg-white sm:max-w-md"
      >
        <option value="">
          Choisir un actif (bien support)…
        </option>
        <option
          v-for="a in options"
          :key="a.id"
          :value="a.id"
        >
          {{ a.nom }}
        </option>
      </select>
      <div
        v-if="cible"
        class="mt-3"
      >
        <p
          v-if="impactes.length"
          class="mb-2 text-sm text-secondary-600"
        >
          {{ impactes.length }} actif(s) impacté(s) :
        </p>
        <p
          v-else
          class="text-sm text-secondary-400"
        >
          Aucun actif ne dépend de celui-ci.
        </p>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="a in impactes"
            :key="a.id"
            :to="`/actifs-smsi/${a.id}`"
            class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
            :class="a.categorie === 'primaire' ? 'border-red-200 bg-red-50 text-red-700' : 'border-secondary-200 bg-white text-secondary-700 hover:border-primary-300'"
          >
            <Icon
              :name="a.categorie === 'primaire' ? 'lucide:gem' : 'lucide:box'"
              class="size-3.5"
            />{{ a.nom }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Arbres de dépendance -->
    <section class="space-y-3">
      <h2 class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">
        Valeurs métier et leurs biens supports
      </h2>
      <p
        v-if="!primaires.length"
        class="rounded-2xl border border-dashed border-secondary-300 p-8 text-center text-sm text-secondary-500"
      >
        Aucune dépendance déclarée. Promouvez des actifs et reliez-les via « Supporté par » sur leur fiche.
      </p>
      <div
        v-for="p in primaires"
        :key="p.id"
        class="rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
      >
        <NuxtLink
          :to="`/actifs-smsi/${p.id}`"
          class="inline-flex items-center gap-2 font-medium text-secondary-900 hover:text-primary-700"
        >
          <Icon
            name="lucide:gem"
            class="size-4 text-primary-500"
          />{{ p.nom }}
        </NuxtLink>
        <div
          v-if="flattenSupports(p.id).length"
          class="mt-2 space-y-1 border-l border-secondary-100 pl-2"
        >
          <NuxtLink
            v-for="s in flattenSupports(p.id)"
            :key="s.id + s.depth"
            :to="`/actifs-smsi/${s.id}`"
            class="flex items-center gap-1.5 text-sm text-secondary-600 hover:text-primary-700"
            :style="{ paddingLeft: (s.depth * 16) + 'px' }"
          >
            <Icon
              name="lucide:corner-down-right"
              class="size-3.5 text-secondary-300"
            />{{ nom(s.id) }}
          </NuxtLink>
        </div>
        <p
          v-else
          class="mt-1 pl-2 text-xs text-secondary-400"
        >
          Aucun bien support déclaré.
        </p>
      </div>
    </section>
  </div>
</template>
