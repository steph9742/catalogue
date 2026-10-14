<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ actifId: string, editable: boolean }>()

type Sup = { id: string, supportId: string, nom: string, categorie: string | null }
type Rev = { id: string, actifId: string, nom: string, categorie: string | null }
type Actif = { id: string, nom: string }
const api = useApi()

const { data: supports, refresh } = await useAsyncData(
  `actif-supports-${props.actifId}`,
  () => api<Sup[]>(`/api/actifs-smsi/${props.actifId}/supports`),
  { getCachedData: () => undefined },
)
const { data: supportes } = await useAsyncData(
  `actif-supportes-${props.actifId}`,
  () => api<Rev[]>(`/api/actifs-smsi/${props.actifId}/supportes`),
  { getCachedData: () => undefined },
)
const { data: actifs } = await useAsyncData(
  'actifs-smsi-dep-options',
  () => api<Actif[]>('/api/actifs-smsi'),
  { getCachedData: () => undefined },
)

const disponibles = computed(() => {
  const pris = new Set([props.actifId, ...(supports.value ?? []).map(s => s.supportId)])
  return (actifs.value ?? []).filter(a => !pris.has(a.id)).sort((a, b) => a.nom.localeCompare(b.nom))
})

const choix = ref('')
const busy = ref(false)
const add = async () => {
  if (!choix.value || busy.value) return
  busy.value = true
  try {
    await api(`/api/actifs-smsi/${props.actifId}/supports`, { method: 'POST', body: { supportId: choix.value } })
    choix.value = ''
    await refresh()
  }
  finally { busy.value = false }
}
const remove = async (id: string) => {
  await api(`/api/actif-dependance/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <DetailSection
    title="Dépendances (ISO 27005)"
    icon="lucide:workflow"
  >
    <!-- Supporté par -->
    <div class="space-y-2">
      <div class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        Supporté par (biens supports)
      </div>
      <div
        v-if="supports?.length"
        class="flex flex-wrap gap-2"
      >
        <span
          v-for="s in supports"
          :key="s.id"
          class="inline-flex items-center gap-1.5 rounded-lg border border-primary-200/60 bg-primary-50/60 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary-700"
        >
          <NuxtLink
            :to="`/actifs-smsi/${s.supportId}`"
            class="hover:underline"
          >{{ s.nom }}</NuxtLink>
          <button
            v-if="editable"
            aria-label="Retirer"
            class="rounded p-0.5 text-primary-400 transition-colors hover:bg-primary-100 hover:text-red-600"
            @click="remove(s.id)"
          >
            <Icon
              name="lucide:x"
              class="size-3.5"
            />
          </button>
        </span>
      </div>
      <p
        v-else
        class="text-sm text-secondary-400"
      >
        Aucune dépendance déclarée.
      </p>
      <div
        v-if="editable"
        class="flex items-center gap-2"
      >
        <select
          v-model="choix"
          class="w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
        >
          <option value="">
            Ajouter un bien support…
          </option>
          <option
            v-for="a in disponibles"
            :key="a.id"
            :value="a.id"
          >
            {{ a.nom }}
          </option>
        </select>
        <button
          :disabled="busy || !choix"
          class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          @click="add"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Ajouter
        </button>
      </div>
    </div>

    <!-- Supporte (inverse) -->
    <div class="space-y-2 border-t border-secondary-100 pt-4">
      <div class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        Supporte (actifs dépendants)
      </div>
      <div
        v-if="supportes?.length"
        class="flex flex-wrap gap-2"
      >
        <NuxtLink
          v-for="s in supportes"
          :key="s.id"
          :to="`/actifs-smsi/${s.actifId}`"
          class="inline-flex items-center rounded-lg border border-secondary-200 bg-white px-2.5 py-1 text-xs font-medium text-secondary-700 hover:border-primary-300"
        >{{ s.nom }}</NuxtLink>
      </div>
      <p
        v-else
        class="text-sm text-secondary-400"
      >
        Aucun actif ne dépend de celui-ci.
      </p>
    </div>
  </DetailSection>
</template>
