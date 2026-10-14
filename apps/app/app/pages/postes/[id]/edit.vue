<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import LogicielPosteForm from '~/components/postes/LogicielPosteForm.vue'

definePageMeta({ middleware: 'can-propose' })

const route = useRoute()
const eden = useEden()
const api = useApi()
const id = route.params.id as string

const [{ data: logiciel }, { data: populations }] = await Promise.all([
  useAsyncData(`logiciel-${id}`, async () => {
    const { data } = await eden.api.postes({ id }).get()
    return data ?? null
  }, { getCachedData: () => undefined }),
  // `populations` passe par le CRUD générique, donc hors du type eden : on l'appelle
  // via useApi(), comme le reste de l'application.
  useAsyncData(
    'populations',
    () => api<{ id: string, nom: string }[]>('/api/populations'),
    { getCachedData: () => undefined },
  ),
])

const saving = ref(false)
const errorMessage = ref('')

const update = async (payload: Record<string, unknown>) => {
  saving.value = true
  errorMessage.value = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await eden.api.postes({ id }).patch(payload as any)
  saving.value = false
  if (error) {
    errorMessage.value = 'Échec de l\'enregistrement.'
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((data as any)?.queued) alert('Votre demande a été envoyée pour validation par un gestionnaire.')
  await refreshNuxtData([`logiciel-${id}`, `audit-postes-${id}`])
  await navigateTo(`/postes/${id}`)
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6 pb-12 animate-in fade-in duration-500">
    <div
      v-if="!logiciel"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Logiciel introuvable.
    </div>
    <template v-else>
      <header class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UITitle class="tracking-tight text-secondary-950">
            Modifier — {{ logiciel.nom }}
          </UITitle>
          <UIButton
            variant="ghost"
            class="text-sm text-secondary-500 transition-colors hover:bg-secondary-50/80 hover:text-secondary-900"
            @click="navigateTo(`/postes/${id}`)"
          >
            Retour à la fiche
          </UIButton>
        </div>
        <p class="text-sm text-secondary-600/90">
          Mettez à jour les informations du logiciel.
        </p>
      </header>
      <p
        v-if="errorMessage"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ errorMessage }}
      </p>

      <LogicielPosteForm
        :initial="{ ...logiciel }"
        :populations="populations ?? []"
        submit-label="Enregistrer"
        :saving="saving"
        @submit="update"
        @cancel="navigateTo(`/postes/${id}`)"
      />
    </template>
  </div>
</template>
