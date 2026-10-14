<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import ApplicationForm from '~/components/applications/ApplicationForm.vue'

definePageMeta({ middleware: 'can-propose' })

const eden = useEden()
const refs = await useRefOptions()
const saving = ref(false)
const errorMessage = ref('')

const create = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await eden.api.applications.post(payload as any)
  saving.value = false
  if (error) {
    errorMessage.value = 'Échec de la création de l\'application.'
    return
  }
  await refreshNuxtData('applications')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((data as any)?.queued) {
    alert('Votre demande a été envoyée pour validation par un gestionnaire.')
    await navigateTo('/applications')
    return
  }
  await navigateTo(`/applications/${data?.id}`)
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UITitle class="tracking-tight text-secondary-950">
          Nouvelle application
        </UITitle>
        <UIButton
          variant="ghost"
          class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
          @click="navigateTo('/applications')"
        >
          Retour à la liste
        </UIButton>
      </div>
      <p class="text-sm text-secondary-600/90">
        Renseignez les informations de la nouvelle application.
      </p>
    </header>
    <p
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>
    <ApplicationForm
      :refs="refs"
      submit-label="Créer"
      :saving="saving"
      @submit="create"
      @cancel="navigateTo('/applications')"
    />
  </div>
</template>
