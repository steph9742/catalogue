<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ typeSource: string, sourceId: string, nom: string, editable: boolean }>()

type Actif = { id: string, nom: string } | null
const api = useApi()
const { data: actif, refresh } = await useAsyncData(
  `perimetre-smsi-${props.typeSource}-${props.sourceId}`,
  () => api<Actif>(`/api/actifs-smsi/source/${props.typeSource}/${props.sourceId}`),
  { getCachedData: () => undefined },
)

const busy = ref(false)
const promote = async () => {
  busy.value = true
  try {
    await api('/api/actifs-smsi/promote', { method: 'POST', body: { typeSource: props.typeSource, sourceId: props.sourceId, nom: props.nom } })
    await refresh()
  }
  finally { busy.value = false }
}
const depromote = async () => {
  busy.value = true
  try {
    await api(`/api/actifs-smsi/source/${props.typeSource}/${props.sourceId}`, { method: 'DELETE' })
    await refresh()
  }
  finally { busy.value = false }
}
</script>

<template>
  <DetailSection
    title="Périmètre SMSI"
    icon="lucide:shield-check"
  >
    <div
      v-if="actif"
      class="flex flex-wrap items-center gap-3"
    >
      <span class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <Icon
          name="lucide:check"
          class="size-3.5"
        /> Dans le périmètre SMSI
      </span>
      <NuxtLink
        :to="`/actifs-smsi/${actif.id}`"
        class="text-sm text-primary-600 hover:underline"
      >Ouvrir l'actif SMSI (valorisation, risques) →</NuxtLink>
      <button
        v-if="editable"
        :disabled="busy"
        class="ml-auto text-xs text-secondary-500 transition-colors hover:text-red-600 disabled:opacity-50"
        @click="depromote"
      >
        Retirer du périmètre
      </button>
    </div>
    <div
      v-else
      class="flex flex-wrap items-center gap-3"
    >
      <span class="text-sm text-secondary-500">Cet actif n'est pas dans le périmètre du SMSI.</span>
      <button
        v-if="editable"
        :disabled="busy"
        class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        @click="promote"
      >
        <Icon
          name="lucide:shield-plus"
          class="size-4"
        /> Ajouter au périmètre SMSI
      </button>
    </div>
  </DetailSection>
</template>
