<script setup lang="ts">
import { reactive } from 'vue'
import { UIButton } from '@catalogue/ui'
import { catalogues, capitalize } from '~/utils/catalogues'
import CatalogueForm from '~/components/catalogue/CatalogueForm.vue'

definePageMeta({ middleware: 'can-propose' })

const route = useRoute()
const key = route.params.catalogue as string
const config = catalogues[key]
if (!config) throw createError({ statusCode: 404, statusMessage: 'Catalogue inconnu' })

const api = useApi()

// Options des champs « ref » (FK) chargées depuis leur catalogue.
const refOptions = reactive<Record<string, { value: string, label: string }[]>>({})
for (const f of config.fields.filter(f => f.type === 'ref' && f.endpoint)) {
  refOptions[f.endpoint!] = await useRefLabels(f.endpoint!, f.labelKey)
}

const saving = ref(false)
const errorMessage = ref('')

const create = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  try {
    const res = await api<{ queued?: boolean }>(`/api/${config.endpoint}`, { method: 'POST', body: payload })
    await refreshNuxtData(`cat-${key}`)
    if (res?.queued) alert('Votre demande a été envoyée pour validation par un gestionnaire.')
    await navigateTo(`/${config.key}`)
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
          Nouveau — {{ capitalize(config.singular) }}
        </UITitle>
        <UIButton
          variant="ghost"
          class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
          @click="navigateTo(`/${config.key}`)"
        >
          Retour à la liste
        </UIButton>
      </div>
      <p class="text-sm text-secondary-600/90">
        Renseignez les informations.
      </p>
    </header>
    <p
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>
    <CatalogueForm
      :fields="config.fields"
      :ref-options="refOptions"
      :title="capitalize(config.singular)"
      submit-label="Créer"
      :saving="saving"
      @submit="create"
      @cancel="navigateTo(`/${config.key}`)"
    />
  </div>
</template>
