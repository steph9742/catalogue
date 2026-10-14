<script setup lang="ts">
import { UISelect } from '@catalogue/ui'
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ entiteId: string, editable: boolean }>()

type Membre = { id: string, role: string, ordre: number | null, personneId: string, nom: string, prenom: string | null }
const api = useApi()
const { data: membres, refresh } = await useAsyncData(
  `entite-resp-${props.entiteId}`,
  () => api<Membre[]>(`/api/entites/${props.entiteId}/responsables`),
  { getCachedData: () => undefined },
)
const { data: personnes } = await useAsyncData('personnes-all', () => api<Record<string, unknown>[]>('/api/personnes'), { getCachedData: () => undefined })

const ROLES: { value: string, label: string }[] = [
  { value: 'president', label: 'Président·e' },
  { value: 'vice_president', label: 'Vice-président·e' },
  { value: 'chef_cabinet', label: 'Chef·fe de cabinet' },
  { value: 'secretaire_cabinet', label: 'Secrétaire de cabinet' },
  { value: 'dgs', label: 'DGS' },
  { value: 'dga', label: 'DGA' },
]
const groups = computed(() => ROLES
  .map(r => ({ ...r, membres: (membres.value ?? []).filter(m => m.role === r.value) }))
  .filter(g => g.membres.length))

const personneItems = computed(() => (personnes.value ?? []).map(p => ({ value: String(p.id), label: `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim() })))
const fullName = (m: Membre) => `${m.prenom ? m.prenom + ' ' : ''}${m.nom}`.trim()

const draftPers = ref('')
const draftRole = ref('president')
const busy = ref(false)
const add = async () => {
  if (!draftPers.value || busy.value) return
  busy.value = true
  try {
    await api(`/api/entites/${props.entiteId}/responsables`, { method: 'POST', body: { personneId: draftPers.value, role: draftRole.value } })
    draftPers.value = ''
    await refresh()
  }
  finally { busy.value = false }
}
const remove = async (id: string) => {
  await api(`/api/entite-responsables/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <DetailSection
    title="Gouvernance"
    icon="lucide:crown"
  >
    <div
      v-if="groups.length"
      class="space-y-3"
    >
      <div
        v-for="g in groups"
        :key="g.value"
        class="grid grid-cols-[9rem_1fr] items-start gap-3"
      >
        <div class="pt-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
          {{ g.label }}
        </div>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="m in g.membres"
            :key="m.id"
            :to="`/personnes/${m.personneId}`"
            class="group inline-flex items-center gap-1.5 rounded-lg border border-primary-200/60 bg-primary-50/60 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary-700 transition-colors hover:border-primary-300"
          >
            <Icon
              name="lucide:user-round"
              class="size-3.5 text-primary-400"
            /> {{ fullName(m) }}
            <button
              v-if="editable"
              aria-label="Retirer"
              class="rounded p-0.5 text-primary-400 transition-colors hover:bg-primary-100 hover:text-red-600"
              @click.prevent="remove(m.id)"
            >
              <Icon
                name="lucide:x"
                class="size-3.5"
              />
            </button>
          </NuxtLink>
        </div>
      </div>
    </div>
    <p
      v-else
      class="text-sm text-secondary-400"
    >
      Aucun membre de gouvernance renseigné.
    </p>

    <div
      v-if="editable"
      class="flex flex-wrap items-end gap-2 border-t border-secondary-100 pt-4"
    >
      <div class="min-w-[12rem] flex-1 space-y-1">
        <label class="block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Personne</label>
        <UISelect
          class="!max-w-none"
          :items="personneItems"
          :multi-select="false"
          :searchable="true"
          :model-value="draftPers"
          placeholder="Choisir une personne…"
          @update:model-value="draftPers = String($event ?? '')"
        />
      </div>
      <div class="min-w-[10rem] space-y-1">
        <label class="block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Rôle</label>
        <UISelect
          class="!max-w-none"
          :items="ROLES"
          :multi-select="false"
          :model-value="draftRole"
          @update:model-value="draftRole = String($event ?? 'president')"
        />
      </div>
      <button
        :disabled="busy || !draftPers"
        class="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary-600 px-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
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
