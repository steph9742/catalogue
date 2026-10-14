<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import TiersForm from '~/components/tiers/TiersForm.vue'

definePageMeta({ middleware: 'can-propose' })

const api = useApi()
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

const create = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  try {
    const created = await api<{ id?: string, queued?: boolean }>('/api/tiers', { method: 'POST', body: payload })
    await refreshNuxtData('cat-tiers')
    if (created?.queued) {
      alert('Votre demande a été envoyée pour validation par un gestionnaire.')
      await navigateTo('/tiers')
      return
    }
    await navigateTo(`/tiers/${created.id}`)
  }
  catch (e: unknown) {
    const data = (e as { data?: unknown })?.data
    errorMessage.value = typeof data === 'string' ? data : 'Échec de la création.'
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UITitle class="tracking-tight text-secondary-950">
          Nouveau prestataire
        </UITitle>
        <UIButton
          variant="ghost"
          class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
          @click="navigateTo('/tiers')"
        >
          Retour à la liste
        </UIButton>
      </div>
      <p class="text-sm text-secondary-600/90">
        Renseignez le prestataire, ses contacts et référents.
      </p>
    </header>
    <p
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>
    <TiersForm
      :personnes="personnes"
      submit-label="Créer"
      :saving="saving"
      @submit="create"
      @cancel="navigateTo('/tiers')"
    />
  </div>
</template>
