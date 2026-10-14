<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import WebhookForm from '~/components/webhooks/WebhookForm.vue'

definePageMeta({ middleware: 'can-propose' })

const api = useApi()
const saving = ref(false)
const errorMessage = ref('')

const create = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  try {
    await api('/api/webhooks', { method: 'POST', body: payload })
    await refreshNuxtData('webhooks')
    await navigateTo('/webhooks')
  }
  catch {
    errorMessage.value = 'Échec de la création.'
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UITitle class="tracking-tight text-secondary-950">
          Nouveau webhook
        </UITitle>
        <UIButton
          variant="ghost"
          class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
          @click="navigateTo('/webhooks')"
        >
          Retour à la liste
        </UIButton>
      </div>
      <p class="text-sm text-secondary-600/90">
        Relaie les événements du catalogue vers un flux externe.
      </p>
    </header>
    <p
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>
    <WebhookForm
      submit-label="Créer"
      :saving="saving"
      @submit="create"
      @cancel="navigateTo('/webhooks')"
    />
  </div>
</template>
