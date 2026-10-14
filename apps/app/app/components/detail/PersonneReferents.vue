<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ personneId: string, editable: boolean }>()

type Titre = { id: string, titre: string, kind: 'referent' | 'mission' }
const api = useApi()
const { data: titres, refresh } = await useAsyncData(
  `referents-${props.personneId}`,
  () => api<Titre[]>(`/api/personnes/${props.personneId}/referents`),
  { getCachedData: () => undefined },
)

const referents = computed(() => (titres.value ?? []).filter(t => t.kind === 'referent'))
const missions = computed(() => (titres.value ?? []).filter(t => t.kind === 'mission'))

const draft = reactive({ referent: '', mission: '' })
const busy = ref(false)
const add = async (kind: 'referent' | 'mission') => {
  const titre = draft[kind].trim()
  if (!titre || busy.value) return
  busy.value = true
  try {
    await api(`/api/personnes/${props.personneId}/referents`, { method: 'POST', body: { titre, kind } })
    draft[kind] = ''
    await refresh()
  }
  finally { busy.value = false }
}
const remove = async (id: string) => {
  await api(`/api/referents/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <DetailSection
    title="Référents & rôles"
    icon="lucide:badge-check"
  >
    <!-- Référent de … -->
    <div class="space-y-2">
      <div class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        Référent de
      </div>
      <div
        v-if="referents.length"
        class="flex flex-wrap gap-2"
      >
        <span
          v-for="r in referents"
          :key="r.id"
          class="inline-flex items-center gap-1.5 rounded-lg border border-primary-200/60 bg-primary-50/60 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary-700"
        >
          {{ r.titre }}
          <button
            v-if="editable"
            aria-label="Retirer"
            class="rounded p-0.5 text-primary-400 transition-colors hover:bg-primary-100 hover:text-red-600"
            @click="remove(r.id)"
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
        N'est référent de rien.
      </p>
      <div
        v-if="editable"
        class="flex items-center gap-2"
      >
        <input
          v-model="draft.referent"
          placeholder="Référent de… (ex. Moodle, Apogée) puis Entrée"
          class="w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
          @keyup.enter="add('referent')"
        >
        <button
          :disabled="busy || !draft.referent.trim()"
          class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          @click="add('referent')"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Ajouter
        </button>
      </div>
    </div>

    <!-- Rôles & missions -->
    <div class="space-y-2 border-t border-secondary-100 pt-4">
      <div class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        Rôles & missions
      </div>
      <div
        v-if="missions.length"
        class="flex flex-wrap gap-2"
      >
        <span
          v-for="r in missions"
          :key="r.id"
          class="inline-flex items-center gap-1.5 rounded-lg border border-accent-200/60 bg-accent-50/60 py-1 pl-2.5 pr-1.5 text-xs font-medium text-accent-700"
        >
          {{ r.titre }}
          <button
            v-if="editable"
            aria-label="Retirer"
            class="rounded p-0.5 text-accent-400 transition-colors hover:bg-accent-100 hover:text-red-600"
            @click="remove(r.id)"
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
        N'a aucun rôle ni mission.
      </p>
      <div
        v-if="editable"
        class="flex items-center gap-2"
      >
        <input
          v-model="draft.mission"
          placeholder="Rôle / mission (ex. RSSI adjoint, DPO) puis Entrée"
          class="w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
          @keyup.enter="add('mission')"
        >
        <button
          :disabled="busy || !draft.mission.trim()"
          class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          @click="add('mission')"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Ajouter
        </button>
      </div>
    </div>
  </DetailSection>
</template>
