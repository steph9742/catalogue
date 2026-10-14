<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ risqueId: string, editable: boolean }>()

type Lien = { id: string, mesureSmsiId: string, reference: string, intitule: string }
type Mesure = { id: string, reference: string, intitule: string }
const api = useApi()

const { data: liens, refresh } = await useAsyncData(
  `risque-mesures-${props.risqueId}`,
  () => api<Lien[]>(`/api/risques-smsi/${props.risqueId}/mesures`),
  { getCachedData: () => undefined },
)
const { data: mesures } = await useAsyncData(
  'mesures-smsi-options',
  () => api<Mesure[]>('/api/mesures-smsi'),
  { getCachedData: () => undefined },
)

const disponibles = computed(() => {
  const pris = new Set((liens.value ?? []).map(l => l.mesureSmsiId))
  return (mesures.value ?? []).filter(m => !pris.has(m.id)).sort((a, b) => a.reference.localeCompare(b.reference))
})

const choix = ref('')
const busy = ref(false)
const add = async () => {
  if (!choix.value || busy.value) return
  busy.value = true
  try {
    await api(`/api/risques-smsi/${props.risqueId}/mesures`, { method: 'POST', body: { mesureSmsiId: choix.value } })
    choix.value = ''
    await refresh()
  }
  finally { busy.value = false }
}
const remove = async (id: string) => {
  await api(`/api/risque-mesure/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <DetailSection
    title="Plan de traitement (mesures)"
    icon="lucide:list-checks"
  >
    <div
      v-if="liens?.length"
      class="flex flex-wrap gap-2"
    >
      <span
        v-for="l in liens"
        :key="l.id"
        class="inline-flex items-center gap-1.5 rounded-lg border border-accent-200/60 bg-accent-50/60 py-1 pl-2.5 pr-1.5 text-xs font-medium text-accent-700"
      >
        <NuxtLink
          :to="`/mesures-smsi/${l.mesureSmsiId}`"
          class="hover:underline"
          :title="l.intitule"
        >{{ l.reference }} — {{ l.intitule }}</NuxtLink>
        <button
          v-if="editable"
          aria-label="Retirer"
          class="rounded p-0.5 text-accent-400 transition-colors hover:bg-accent-100 hover:text-red-600"
          @click="remove(l.id)"
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
      Aucune mesure de traitement rattachée.
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
          Ajouter une mesure de traitement…
        </option>
        <option
          v-for="m in disponibles"
          :key="m.id"
          :value="m.id"
        >
          {{ m.reference }} — {{ m.intitule }}
        </option>
      </select>
      <button
        :disabled="busy || !choix"
        class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
        @click="add"
      >
        <Icon
          name="lucide:plus"
          class="size-4"
        /> Ajouter
      </button>
    </div>
  </DetailSection>
</template>
