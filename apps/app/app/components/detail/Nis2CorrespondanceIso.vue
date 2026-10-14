<script setup lang="ts">
// CORRESPONDANCE OFFICIELLE ANSSI ↔ ISO sur la fiche d'une exigence NIS 2 — LECTURE SEULE.
const props = defineProps<{ exigenceId: string }>()

type Renvoi = {
  norme: string
  reference: string
  intitule: string
  cible: { type: 'soa' | 'clause', id: string } | null
}
type Reponse = {
  correspondance: 'elevee' | 'moyenne' | 'faible' | null
  observations: string | null
  renvois: Renvoi[]
}

const api = useApi()
const { data } = await useAsyncData(
  `nis2-iso-${props.exigenceId}`,
  () => api<Reponse>(`/api/exigences-nis2/${props.exigenceId}/iso`),
  { getCachedData: () => undefined },
)

const renvois = computed(() => data.value?.renvois ?? [])
const parNorme = computed(() => {
  const groupes = new Map<string, Renvoi[]>()
  for (const r of renvois.value) {
    const acc = groupes.get(r.norme) ?? []
    acc.push(r)
    groupes.set(r.norme, acc)
  }
  return [...groupes.entries()]
})

// « faible » est le niveau qui appelle l'attention : c'est là qu'est le travail restant.
const NIVEAUX: Record<string, { label: string, cls: string, aide: string }> = {
  elevee: {
    label: 'Correspondance élevée',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    aide: 'L\'ISO 27001/27002 couvre largement cette exigence : un établissement certifié a l\'essentiel du travail derrière lui.',
  },
  moyenne: {
    label: 'Correspondance moyenne',
    cls: 'border-amber-200 bg-amber-50 text-amber-700',
    aide: 'L\'ISO couvre partiellement cette exigence : vérifier ce que le référentiel NIS 2 demande en plus.',
  },
  faible: {
    label: 'Correspondance faible',
    cls: 'border-red-200 bg-red-50 text-red-700',
    aide: 'L\'ISO ne couvre pas vraiment cette exigence : c\'est ici que se trouve le travail supplémentaire, même pour un établissement certifié.',
  },
}

const lien = (r: Renvoi) => {
  if (!r.cible) return null
  return r.cible.type === 'soa' ? `/mesures-smsi/${r.cible.id}` : `/clauses-iso27001/${r.cible.id}`
}
const refAffichee = (r: Renvoi) => r.norme.startsWith('27002') ? `A.${r.reference}` : r.reference
</script>

<template>
  <DetailSection
    v-if="data && (data.correspondance || renvois.length)"
    title="Correspondance ISO (table officielle ANSSI)"
    icon="lucide:git-compare"
  >
    <div class="space-y-3">
      <div
        v-if="data.correspondance"
        class="flex flex-wrap items-center gap-2"
      >
        <span
          class="inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold"
          :class="NIVEAUX[data.correspondance]?.cls"
          :title="NIVEAUX[data.correspondance]?.aide"
        >{{ NIVEAUX[data.correspondance]?.label }}</span>
        <span class="text-xs text-secondary-500">{{ NIVEAUX[data.correspondance]?.aide }}</span>
      </div>

      <!-- Observation de l'ANSSI, verbatim : c'est une source officielle, pas une
           reformulation — elle explique POURQUOI l'écart existe. -->
      <p
        v-if="data.observations"
        class="rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3 text-sm text-secondary-700"
      >
        <span class="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">Observation de l'ANSSI</span>
        {{ data.observations }}
      </p>

      <div
        v-for="[norme, groupe] in parNorme"
        :key="norme"
        class="space-y-1"
      >
        <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">
          ISO/IEC {{ norme }}
        </p>
        <ul class="divide-y divide-secondary-100">
          <li
            v-for="r in groupe"
            :key="r.reference"
            class="flex flex-wrap items-baseline gap-2 py-1.5"
          >
            <NuxtLink
              v-if="lien(r)"
              :to="lien(r)!"
              class="font-mono text-xs font-semibold text-primary-700 hover:underline"
            >{{ refAffichee(r) }}</NuxtLink>
            <span
              v-else
              class="font-mono text-xs font-semibold text-secondary-500"
              title="Référentiel non importé : la cible n'existe pas encore en base."
            >{{ refAffichee(r) }}</span>
            <span class="min-w-0 flex-1 text-sm text-secondary-700">{{ r.intitule }}</span>
          </li>
        </ul>
      </div>
    </div>
  </DetailSection>
</template>
