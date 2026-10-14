<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import TiersForm from '~/components/tiers/TiersForm.vue'

definePageMeta({ middleware: 'can-propose' })

const route = useRoute()
const api = useApi()
const id = route.params.id as string

const { data: tiers } = await useAsyncData(`tiers-${id}`, () =>
  api<Record<string, unknown>>(`/api/tiers/${id}`),
{ getCachedData: () => undefined })
const { data: personnesRows } = await useAsyncData('opts-personnes', () =>
  api<Record<string, unknown>[]>('/api/personnes'),
{ getCachedData: () => undefined })
const personnes = computed(() =>
  (personnesRows.value ?? []).map(p => ({
    value: String(p.id),
    label: `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim(),
  })),
)

const saving = ref(false)
const errorMessage = ref('')

const update = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  try {
    const res = await api<{ queued?: boolean }>(`/api/tiers/${id}`, { method: 'PATCH', body: payload })
    if (res?.queued) alert('Votre demande a été envoyée pour validation par un gestionnaire.')
    await refreshNuxtData([`tiers-${id}`, `audit-tiers-${id}`])
    await navigateTo(`/tiers/${id}`)
  }
  catch (e: unknown) {
    const data = (e as { data?: unknown })?.data
    errorMessage.value = typeof data === 'string' ? data : 'Échec de l\'enregistrement.'
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <div
      v-if="!tiers"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Tiers introuvable.
    </div>
    <template v-else>
      <header class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UITitle class="tracking-tight text-secondary-950">
            Modifier — {{ tiers.nom }}
          </UITitle>
          <UIButton
            variant="ghost"
            class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
            @click="navigateTo(`/tiers/${id}`)"
          >
            Retour à la fiche
          </UIButton>
        </div>
        <p class="text-sm text-secondary-600/90">
          Mettez à jour les informations du tiers.
        </p>
      </header>
      <p
        v-if="errorMessage"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ errorMessage }}
      </p>

      <TiersForm
        :initial="tiers"
        :personnes="personnes"
        submit-label="Enregistrer"
        :saving="saving"
        @submit="update"
        @cancel="navigateTo(`/tiers/${id}`)"
      />
    </template>
  </div>
</template>
