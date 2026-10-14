<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import WebhookForm from '~/components/webhooks/WebhookForm.vue'

const route = useRoute()
const api = useApi()
const id = route.params.id as string

const { data: hook } = await useAsyncData(`webhook-${id}`, () =>
  api<Record<string, unknown>>(`/api/webhooks/${id}`),
{ getCachedData: () => undefined })

// Le nom du webhook dans l'onglet, plutôt que « Webhooks » pour chacun.
useHead({ title: () => (typeof hook.value?.nom === 'string' ? hook.value.nom : undefined) })

const saving = ref(false)
const errorMessage = ref('')

const update = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  try {
    await api(`/api/webhooks/${id}`, { method: 'PATCH', body: payload })
    await refreshNuxtData(['webhooks', `webhook-${id}`])
    await navigateTo('/webhooks')
  }
  catch {
    errorMessage.value = 'Échec de l\'enregistrement.'
    saving.value = false
  }
}

const remove = async () => {
  if (!confirm('Supprimer ce webhook ?')) return
  await api(`/api/webhooks/${id}`, { method: 'DELETE' })
  await refreshNuxtData('webhooks')
  await navigateTo('/webhooks')
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <div
      v-if="!hook"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Webhook introuvable.
    </div>
    <template v-else>
      <header class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UITitle class="tracking-tight text-secondary-950">
            {{ hook.nom }}
          </UITitle>
          <div class="flex items-center gap-2">
            <UIButton
              variant="ghost"
              class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
              @click="navigateTo('/webhooks')"
            >
              Retour
            </UIButton>
            <UIButton
              variant="outline"
              class="text-red-600 hover:bg-red-50"
              @click="remove"
            >
              <Icon
                name="lucide:trash-2"
                class="size-4"
              /> Supprimer
            </UIButton>
          </div>
        </div>
        <p class="text-sm text-secondary-600/90">
          Modifier la configuration et les événements relayés.
        </p>
      </header>
      <p
        v-if="errorMessage"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ errorMessage }}
      </p>
      <WebhookForm
        :initial="hook"
        submit-label="Enregistrer"
        :saving="saving"
        @submit="update"
        @cancel="navigateTo('/webhooks')"
      />
    </template>
  </div>
</template>
