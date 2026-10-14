<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
import { exportTable, type ExportColumn, type ExportFormat } from '~/utils/tableExport'
import ImportDialog from '~/components/catalogue/ImportDialog.vue'
import CatalogueFilterBar from '~/components/catalogue/CatalogueFilterBar.vue'
import {
  labelOf, labelOfAutre, appCategories, appCriticites, appStatuts,
  appHebergements, appExpositions, appSensibilites,
} from '~/utils/catalogueEnums'
import { appStatutTone, appCriticiteTone, appExpositionTone } from '~/utils/pillTones'

const eden = useEden()
const perms = await usePermissions()
const writable = computed(() => perms.canWrite('applications'))
const proposable = computed(() => perms.canPropose('applications'))

const { data: applications, pending, error, refresh } = await useAsyncData(
  'applications',
  async () => {
    const { data } = await eden.api.applications.get()
    return data ?? []
  },
  { getCachedData: () => undefined },
)

type AppRow = NonNullable<typeof applications.value>[number]

const columns: ExportColumn<AppRow>[] = [
  { header: 'Nom', value: a => a.nom },
  { header: 'Catégorie', value: a => labelOfAutre(appCategories, a.categorie, a.categoriePrecision) },
  { header: 'Criticité', value: a => labelOf(appCriticites, a.criticite) },
  { header: 'Statut', value: a => labelOf(appStatuts, a.statut) },
  { header: 'Hébergement', value: a => labelOf(appHebergements, a.hebergement) },
  { header: 'Exposition', value: a => labelOf(appExpositions, a.exposition) },
  { header: 'Sensibilité', value: a => labelOf(appSensibilites, a.sensibilite) },
  { header: 'Données personnelles', value: a => (a.donneesPersonnelles ? 'oui' : 'non') },
  { header: 'Open source', value: a => (a.openSource ? 'oui' : 'non') },
  { header: 'Dev interne', value: a => (a.devInterne ? 'oui' : 'non') },
  { header: 'URL', value: a => a.url },
]

const doExport = (format: ExportFormat) => {
  const rows = applications.value ?? []
  if (rows.length) void exportTable(rows, columns, 'applications', format)
}

const search = ref('')
const activeFilters = ref<Record<string, (string | number)[]>>({})
const filterDefs = [
  { key: 'categorie', label: 'Catégorie', options: appCategories },
  { key: 'statut', label: 'Statut', options: appStatuts },
  { key: 'criticite', label: 'Criticité', options: appCriticites },
  { key: 'exposition', label: 'Exposition', options: appExpositions },
  { key: 'hebergement', label: 'Hébergement', options: appHebergements },
  { key: 'sensibilite', label: 'Sensibilité', options: appSensibilites },
]
const filtered = computed(() => {
  let list = applications.value ?? []
  for (const [k, vals] of Object.entries(activeFilters.value)) {
    if (!vals?.length) continue
    const set = vals.map(String)
    list = list.filter((a: AppRow) => set.includes(String((a as unknown as Record<string, unknown>)[k] ?? '')))
  }
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter((a: AppRow) => [a.nom, labelOfAutre(appCategories, a.categorie, a.categoriePrecision), labelOf(appCriticites, a.criticite), labelOf(appStatuts, a.statut), labelOf(appExpositions, a.exposition), a.description, a.url]
    .filter(Boolean).join(' ').toLowerCase().includes(q))
  return list
})

const showImport = ref(false)
const importFields = [
  { key: 'nom', label: 'Nom' },
  { key: 'categorie', label: 'Catégorie' },
  { key: 'criticite', label: 'Criticité' },
  { key: 'statut', label: 'Statut' },
  { key: 'hebergement', label: 'Hébergement' },
  { key: 'exposition', label: 'Exposition' },
  { key: 'sensibilite', label: 'Sensibilité' },
  { key: 'donneesPersonnelles', label: 'Données personnelles' },
  { key: 'openSource', label: 'Open source' },
  { key: 'devInterne', label: 'Dev interne' },
  { key: 'maintenueAJour', label: 'Mise à jour' },
  { key: 'url', label: 'URL' },
  { key: 'dateMiseEnService', label: 'Mise en service' },
  { key: 'dateFinDeSupport', label: 'Fin de support' },
  // Références résolues par nom (créées à la volée) côté serveur.
  { key: 'responsable', label: 'Responsable' },
  { key: 'pole', label: 'Pôle' },
  { key: 'editeur', label: 'Éditeur' },
]
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Applications
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Inventaire des applications métiers et techniques.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UIButton
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          :disabled="!applications?.length"
          @click="doExport('csv')"
        >
          <Icon
            name="lucide:download"
            class="size-4"
          /> CSV
        </UIButton>
        <UIButton
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          :disabled="!applications?.length"
          @click="doExport('ods')"
        >
          <Icon
            name="lucide:download"
            class="size-4"
          /> LibreOffice
        </UIButton>
        <UIButton
          v-if="writable"
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          @click="showImport = true"
        >
          <Icon
            name="lucide:upload"
            class="size-4"
          /> Importer
        </UIButton>
        <UIButton
          v-if="proposable"
          variant="primary"
          class="font-medium tracking-tight shadow-sm shadow-primary-500/20 transition-all duration-300 hover:shadow-md hover:shadow-primary-500/30"
          @click="navigateTo('/applications/new')"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Nouvelle
        </UIButton>
      </div>
    </header>

    <CatalogueFilterBar
      v-if="applications?.length"
      v-model:search="search"
      v-model:active="activeFilters"
      :filters="filterDefs"
      :placeholder="`Rechercher parmi ${applications.length} application${applications.length > 1 ? 's' : ''}…`"
    />

    <section
      v-if="pending"
      class="flex items-center justify-center rounded-2xl border border-dashed border-primary-200/50 bg-primary-50/40 py-24"
    >
      <div class="flex items-center gap-3 font-mono text-sm text-primary-600">
        <div class="size-3 animate-ping rounded-full bg-primary-400" /> Chargement…
      </div>
    </section>
    <section
      v-else-if="error"
      class="rounded-2xl border border-red-200 bg-red-50/60 p-6 text-sm text-red-700"
    >
      Erreur de chargement de l'API.
    </section>
    <section
      v-else-if="!applications?.length"
      class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
        <Icon
          name="lucide:app-window"
          class="size-7 text-primary-600"
        />
      </div>
      <p class="font-medium text-secondary-600">
        Aucune application.
      </p>
      <p class="mt-1 text-sm text-secondary-500">
        Cliquez sur « Nouvelle » pour en créer une.
      </p>
    </section>
    <section
      v-else-if="!filtered.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucun résultat pour « {{ search }} ».
    </section>

    <section
      v-else
      class="grid grid-cols-1 gap-3"
    >
      <NuxtLink
        v-for="app in filtered"
        :key="app.id"
        :to="`/applications/${app.id}`"
        class="group relative block overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] sm:p-5"
      >
        <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div class="flex flex-col gap-3 pl-1 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-base font-medium tracking-tight text-secondary-900 transition-colors group-hover:text-primary-900">{{ app.nom }}</h3>
              <Pill tone="primary">{{ labelOfAutre(appCategories, app.categorie, app.categoriePrecision) }}</Pill>
            </div>
            <p
              v-if="app.description"
              class="mt-1 max-w-xl truncate text-sm text-secondary-500"
            >{{ app.description }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <Pill :tone="appStatutTone(app.statut)">{{ labelOf(appStatuts, app.statut) }}</Pill>
            <Pill
              v-if="app.criticite"
              :tone="appCriticiteTone(app.criticite)"
            >{{ labelOf(appCriticites, app.criticite) }}</Pill>
            <Pill
              v-if="app.exposition"
              :tone="appExpositionTone(app.exposition)"
            >{{ labelOf(appExpositions, app.exposition) }}</Pill>
          </div>
        </div>
      </NuxtLink>
    </section>

    <ImportDialog
      v-if="showImport"
      endpoint="applications"
      natural-key="nom"
      label="Applications"
      :fields="importFields"
      @close="showImport = false"
      @imported="showImport = false; refresh()"
    />
  </div>
</template>
