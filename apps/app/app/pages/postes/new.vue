<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import LogicielPosteForm from '~/components/postes/LogicielPosteForm.vue'

definePageMeta({ middleware: 'can-propose' })

const eden = useEden()
const api = useApi()

// `populations` passe par le CRUD générique, donc hors du type eden : on l'appelle
// via useApi(), comme le reste de l'application.
const { data: populations } = await useAsyncData(
  'populations',
  () => api<{ id: string, nom: string }[]>('/api/populations'),
  { getCachedData: () => undefined },
)

const saving = ref(false)
const errorMessage = ref('')

const create = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await eden.api.postes.post(payload as any)
  saving.value = false
  if (error) {
    errorMessage.value = 'Échec de la création du logiciel.'
    return
  }
  await refreshNuxtData('logiciels-poste')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((data as any)?.queued) {
    alert('Votre demande a été envoyée pour validation par un gestionnaire.')
    await navigateTo('/postes')
    return
  }
  await navigateTo(`/postes/${data?.id}`)
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UITitle class="tracking-tight text-secondary-950">
          Nouveau logiciel
        </UITitle>
        <UIButton
          variant="ghost"
          class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
          @click="navigateTo('/postes')"
        >
          Retour à la liste
        </UIButton>
      </div>
      <p class="text-sm text-secondary-600/90">
        Renseignez le logiciel autorisé sur les postes.
      </p>
    </header>
    <p
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>
    <LogicielPosteForm
      :populations="populations ?? []"
      submit-label="Créer"
      :saving="saving"
      @submit="create"
      @cancel="navigateTo('/postes')"
    />
  </div>
</template>
