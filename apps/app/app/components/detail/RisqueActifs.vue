<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ risqueId: string, editable: boolean }>()

type Lien = { id: string, actifSmsiId: string, nom: string, categorie: string | null, vulnerabilite: string | null }
type Actif = { id: string, nom: string }
const api = useApi()

const { data: liens, refresh } = await useAsyncData(
  `risque-actifs-${props.risqueId}`,
  () => api<Lien[]>(`/api/risques-smsi/${props.risqueId}/actifs`),
  { getCachedData: () => undefined },
)
const { data: actifs } = await useAsyncData(
  'actifs-smsi-options',
  () => api<Actif[]>('/api/actifs-smsi'),
  { getCachedData: () => undefined },
)

const disponibles = computed(() => {
  const pris = new Set((liens.value ?? []).map(l => l.actifSmsiId))
  return (actifs.value ?? []).filter(a => !pris.has(a.id)).sort((a, b) => a.nom.localeCompare(b.nom))
})

// Brouillon de vulnérabilité par lien (édition inline, sauvegarde au blur/Entrée).
const vulnDraft = reactive<Record<string, string>>({})
watch(liens, (v) => {
  for (const l of v ?? []) vulnDraft[l.id] = l.vulnerabilite ?? ''
}, { immediate: true })

const choix = ref('')
const draftVuln = ref('')
const busy = ref(false)
const add = async () => {
  if (!choix.value || busy.value) return
  busy.value = true
  try {
    await api(`/api/risques-smsi/${props.risqueId}/actifs`, { method: 'POST', body: { actifSmsiId: choix.value, vulnerabilite: draftVuln.value.trim() || undefined } })
    choix.value = ''
    draftVuln.value = ''
    await refresh()
  }
  finally { busy.value = false }
}
const saveVuln = async (l: Lien) => {
  if ((vulnDraft[l.id] ?? '') === (l.vulnerabilite ?? '')) return
  await api(`/api/risque-actif/${l.id}`, { method: 'PATCH', body: { vulnerabilite: vulnDraft[l.id] || undefined } })
  await refresh()
}
const remove = async (id: string) => {
  await api(`/api/risque-actif/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <DetailSection
    title="Actifs concernés & vulnérabilités"
    icon="lucide:shield-check"
  >
    <div
      v-if="liens?.length"
      class="space-y-2"
    >
      <div
        v-for="l in liens"
        :key="l.id"
        class="flex flex-col gap-2 rounded-lg border border-secondary-200/70 bg-secondary-50/40 p-2 sm:flex-row sm:items-center"
      >
        <NuxtLink
          :to="`/actifs-smsi/${l.actifSmsiId}`"
          class="min-w-0 shrink-0 truncate text-sm font-medium text-secondary-800 hover:text-primary-700 sm:w-56"
        >{{ l.nom }}</NuxtLink>
        <input
          v-model="vulnDraft[l.id]"
          :disabled="!editable"
          placeholder="Vulnérabilité exploitée sur ce support…"
          class="w-full rounded-md border border-secondary-200/80 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 disabled:bg-secondary-50"
          @blur="saveVuln(l)"
          @keyup.enter="saveVuln(l)"
        >
        <button
          v-if="editable"
          aria-label="Retirer"
          class="shrink-0 rounded p-1 text-secondary-400 transition-colors hover:bg-red-50 hover:text-red-600"
          @click="remove(l.id)"
        >
          <Icon
            name="lucide:x"
            class="size-4"
          />
        </button>
      </div>
    </div>
    <p
      v-else
      class="text-sm text-secondary-400"
    >
      Aucun actif rattaché à ce risque.
    </p>

    <div
      v-if="editable"
      class="flex flex-col gap-2 border-t border-secondary-100 pt-3 sm:flex-row sm:items-center"
    >
      <select
        v-model="choix"
        class="rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20 sm:w-56"
      >
        <option value="">
          Ajouter un actif concerné…
        </option>
        <option
          v-for="a in disponibles"
          :key="a.id"
          :value="a.id"
        >
          {{ a.nom }}
        </option>
      </select>
      <input
        v-model="draftVuln"
        placeholder="Vulnérabilité (optionnel)"
        class="w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
        @keyup.enter="add"
      >
      <button
        :disabled="busy || !choix"
        class="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
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
