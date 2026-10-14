<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ actifId: string, editable: boolean }>()

type Lien = { id: string, applicationId: string, nom: string, donneesPersonnelles: boolean | null }
type App = { id: string, nom: string }
const api = useApi()

const { data: liens, refresh } = await useAsyncData(
  `actif-info-apps-${props.actifId}`,
  () => api<Lien[]>(`/api/actifs-informationnels/${props.actifId}/applications`),
  { getCachedData: () => undefined },
)
const { data: apps } = await useAsyncData(
  'applications-options',
  () => api<App[]>('/api/applications'),
  { getCachedData: () => undefined },
)

const disponibles = computed(() => {
  const pris = new Set((liens.value ?? []).map(l => l.applicationId))
  return (apps.value ?? []).filter(a => !pris.has(a.id)).sort((a, b) => a.nom.localeCompare(b.nom))
})

const choix = ref('')
const busy = ref(false)
const add = async () => {
  if (!choix.value || busy.value) return
  busy.value = true
  try {
    await api(`/api/actifs-informationnels/${props.actifId}/applications`, { method: 'POST', body: { applicationId: choix.value } })
    choix.value = ''
    await refresh()
  }
  finally { busy.value = false }
}
const remove = async (id: string) => {
  await api(`/api/actif-information-application/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <DetailSection
    title="Traité par (applications / registre RGPD)"
    icon="lucide:shield"
  >
    <div
      v-if="liens?.length"
      class="flex flex-wrap gap-2"
    >
      <span
        v-for="l in liens"
        :key="l.id"
        class="inline-flex items-center gap-1.5 rounded-lg border border-primary-200/60 bg-primary-50/60 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary-700"
      >
        <NuxtLink
          :to="`/applications/${l.applicationId}`"
          class="hover:underline"
        >{{ l.nom }}</NuxtLink>
        <span
          v-if="l.donneesPersonnelles"
          class="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700"
          title="Traite des données personnelles (registre RGPD)"
        >RGPD</span>
        <button
          v-if="editable"
          aria-label="Retirer"
          class="rounded p-0.5 text-primary-400 transition-colors hover:bg-primary-100 hover:text-red-600"
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
      Aucune application rattachée.
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
          Rattacher une application traitante…
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
  </DetailSection>
</template>
