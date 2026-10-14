<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

// Responsables d'une exigence NIS 2, sur DEUX rôles distincts : le portage organisationnel («
// qui répond de la mise en conformité ») et la mise en œuvre technique.
const props = defineProps<{ exigenceId: string, editable: boolean }>()

type Lien = { id: string, personneId: string, role: 'implementation' | 'technique', nom: string | null }
type Personne = { id: string, nom: string, prenom: string | null }

const api = useApi()
const { data: liens, refresh } = await useAsyncData(
  `nis2-resp-${props.exigenceId}`,
  () => api<Lien[]>(`/api/exigences-nis2/${props.exigenceId}/responsables`),
  { getCachedData: () => undefined },
)
const { data: personnes } = await useAsyncData(
  'nis2-resp-personnes',
  () => api<Personne[]>('/api/personnes'),
  { getCachedData: () => undefined },
)

const ROLES = [
  { value: 'implementation' as const, label: 'Responsable de la mise en conformité', icone: 'lucide:user-check', ton: 'border-primary-200/60 bg-primary-50/60 text-primary-700' },
  { value: 'technique' as const, label: 'Mise en œuvre technique', icone: 'lucide:wrench', ton: 'border-blue-200/60 bg-blue-50/60 text-blue-700' },
]

const parRole = (role: Lien['role']) => (liens.value ?? []).filter(l => l.role === role)
const optionsPersonnes = computed(() =>
  (personnes.value ?? [])
    .map(p => ({ id: p.id, label: `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim() }))
    .sort((a, b) => a.label.localeCompare(b.label)))

const choix = reactive<Record<string, string>>({ implementation: '', technique: '' })
const busy = ref(false)
const ajouter = async (role: Lien['role']) => {
  const personneId = choix[role]
  if (!personneId || busy.value) return
  busy.value = true
  try {
    await api(`/api/exigences-nis2/${props.exigenceId}/responsables`, { method: 'POST', body: { personneId, role } })
    choix[role] = ''
    await refresh()
  }
  finally { busy.value = false }
}
const retirer = async (id: string) => {
  await api(`/api/exigence-nis2-responsable/${id}`, { method: 'DELETE' })
  await refresh()
}

const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const LIBELLE = 'font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <DetailSection
    title="Responsables"
    icon="lucide:users"
  >
    <div
      v-for="r in ROLES"
      :key="r.value"
      class="space-y-2"
    >
      <span :class="LIBELLE">{{ r.label }}</span>

      <div
        v-if="parRole(r.value).length"
        class="flex flex-wrap gap-2"
      >
        <span
          v-for="l in parRole(r.value)"
          :key="l.id"
          class="inline-flex items-center gap-1.5 rounded-lg border py-1 pl-2.5 pr-1.5 text-xs font-medium"
          :class="r.ton"
        >
          <Icon
            :name="r.icone"
            class="size-3.5"
          />
          <NuxtLink
            :to="`/personnes/${l.personneId}`"
            class="hover:underline"
          >{{ l.nom || 'Sans nom' }}</NuxtLink>
          <button
            v-if="editable"
            aria-label="Retirer"
            class="rounded p-0.5 opacity-60 transition-colors hover:bg-white/60 hover:text-red-600 hover:opacity-100"
            @click="retirer(l.id)"
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
        Aucune personne désignée.
      </p>

      <div
        v-if="editable"
        class="flex items-center gap-2"
      >
        <select
          v-model="choix[r.value]"
          :class="[CHAMP, 'w-full']"
        >
          <option value="">
            Ajouter une personne…
          </option>
          <option
            v-for="p in optionsPersonnes"
            :key="p.id"
            :value="p.id"
          >
            {{ p.label }}
          </option>
        </select>
        <button
          :disabled="busy || !choix[r.value]"
          class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          @click="ajouter(r.value)"
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
