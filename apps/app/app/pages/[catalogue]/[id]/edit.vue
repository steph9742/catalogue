<script setup lang="ts">
import { reactive } from 'vue'
import { UIButton } from '@catalogue/ui'
import { catalogues, capitalize } from '~/utils/catalogues'
import CatalogueForm from '~/components/catalogue/CatalogueForm.vue'

definePageMeta({ middleware: 'can-propose' })

const route = useRoute()
const key = route.params.catalogue as string
const id = route.params.id as string
const config = catalogues[key]
if (!config) throw createError({ statusCode: 404, statusMessage: 'Catalogue inconnu' })

const api = useApi()

const { data: item } = await useAsyncData(`cat-${key}-${id}`, () =>
  api<Record<string, unknown>>(`/api/${config.endpoint}/${id}`),
{ getCachedData: () => undefined })

const refOptions = reactive<Record<string, { value: string, label: string }[]>>({})
for (const f of config.fields.filter(f => f.type === 'ref' && f.endpoint)) {
  refOptions[f.endpoint!] = await useRefLabels(f.endpoint!, f.labelKey)
}

const saving = ref(false)
const errorMessage = ref('')
const titleOf = computed(() => item.value ? String(item.value[config.naturalKey] ?? item.value.nom ?? id) : '')

const update = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  try {
    const res = await api<{ queued?: boolean }>(`/api/${config.endpoint}/${id}`, { method: 'PATCH', body: payload })
    if (res?.queued) alert('Votre demande a été envoyée pour validation par un gestionnaire.')
    await refreshNuxtData([`cat-${key}-${id}`, `audit-${key}-${id}`])
    await navigateTo(`/${config.key}/${id}`)
  }
  catch {
    errorMessage.value = 'Échec de l\'enregistrement.'
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <div
      v-if="!item"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Entrée introuvable.
    </div>
    <template v-else>
      <header class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UITitle class="tracking-tight text-secondary-950">
            Modifier — {{ titleOf }}
          </UITitle>
          <UIButton
            variant="ghost"
            class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
            @click="navigateTo(`/${config.key}/${id}`)"
          >
            Retour à la fiche
          </UIButton>
        </div>
        <p class="text-sm text-secondary-600/90">
          Mettez à jour les informations.
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
        :initial="item"
        :ref-options="refOptions"
        :title="capitalize(config.singular)"
        submit-label="Enregistrer"
        :saving="saving"
        @submit="update"
        @cancel="navigateTo(`/${config.key}/${id}`)"
      />
    </template>
  </div>
</template>
