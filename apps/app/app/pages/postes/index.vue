<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
import { exportTable, type ExportColumn, type ExportFormat } from '~/utils/tableExport'
import ImportDialog from '~/components/catalogue/ImportDialog.vue'
import CatalogueFilterBar from '~/components/catalogue/CatalogueFilterBar.vue'
import { labelOf, labelOfAutre, logicielCategories, logicielStatuts, logicielLicences, logicielInstallations } from '~/utils/catalogueEnums'

const eden = useEden()
const perms = await usePermissions()
const writable = computed(() => perms.canWrite('postes'))
const proposable = computed(() => perms.canPropose('postes'))

const { data: logiciels, pending, error, refresh } = await useAsyncData(
  'logiciels-poste',
  async () => {
    const { data } = await eden.api.postes.get()
    return data ?? []
  },
  { getCachedData: () => undefined },
)

type Row = NonNullable<typeof logiciels.value>[number]
const statutTone = (v: string) => ({ autorise: 'emerald', sur_derogation: 'amber', retire: 'gray' }[v] ?? 'gray')

const columns: ExportColumn<Row>[] = [
  { header: 'Nom', value: l => l.nom },
  { header: 'Éditeur', value: l => l.editeur },
  { header: 'Version', value: l => l.version },
  { header: 'Catégorie', value: l => labelOfAutre(logicielCategories, l.categorie, l.categoriePrecision) },
  { header: 'Licence', value: l => labelOfAutre(logicielLicences, l.typeLicence, l.typeLicencePrecision) },
  { header: 'Statut', value: l => labelOf(logicielStatuts, l.statut) },
  { header: 'URL', value: l => l.url },
]

const doExport = (format: ExportFormat) => {
  const rows = logiciels.value ?? []
  if (rows.length) void exportTable(rows, columns, 'postes-de-travail', format)
}

const search = ref('')
const activeFilters = ref<Record<string, (string | number)[]>>({})
const filterDefs = [
  { key: 'categorie', label: 'Catégorie', options: logicielCategories },
  { key: 'statut', label: 'Statut', options: logicielStatuts },
  { key: 'typeLicence', label: 'Licence', options: logicielLicences },
  { key: 'installation', label: 'Installation', options: logicielInstallations },
]
const filtered = computed(() => {
  let list = logiciels.value ?? []
  for (const [k, vals] of Object.entries(activeFilters.value)) {
    if (!vals?.length) continue
    const set = vals.map(String)
    list = list.filter(l => set.includes(String((l as Record<string, unknown>)[k] ?? '')))
  }
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter(l => [l.nom, l.editeur, l.version, labelOfAutre(logicielCategories, l.categorie, l.categoriePrecision), labelOfAutre(logicielLicences, l.typeLicence, l.typeLicencePrecision), labelOf(logicielStatuts, l.statut)]
    .filter(Boolean).join(' ').toLowerCase().includes(q))
  return list
})

const showImport = ref(false)
const importFields = [
  { key: 'nom', label: 'Nom' },
  { key: 'editeur', label: 'Éditeur' },
  { key: 'version', label: 'Version' },
  { key: 'categorie', label: 'Catégorie' },
  { key: 'typeLicence', label: 'Type de licence' },
  { key: 'installation', label: 'Installation' },
  { key: 'statut', label: 'Statut' },
  { key: 'url', label: 'Lien éditeur' },
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
]
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Logiciels postes de travail
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Logiciels autorisés sur les postes, par population.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UIButton
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          :disabled="!logiciels?.length"
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
          :disabled="!logiciels?.length"
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
          @click="navigateTo('/postes/new')"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Nouveau
        </UIButton>
      </div>
    </header>

    <CatalogueFilterBar
      v-if="logiciels?.length"
      v-model:search="search"
      v-model:active="activeFilters"
      :filters="filterDefs"
      :placeholder="`Rechercher parmi ${logiciels.length} logiciel${logiciels.length > 1 ? 's' : ''}…`"
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
      v-else-if="!logiciels?.length"
      class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
        <Icon
          name="lucide:monitor-smartphone"
          class="size-7 text-primary-600"
        />
      </div>
      <p class="font-medium text-secondary-600">
        Aucun logiciel.
      </p>
      <p class="mt-1 text-sm text-secondary-500">
        Cliquez sur « Nouveau » pour en ajouter un.
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
        v-for="l in filtered"
        :key="l.id"
        :to="`/postes/${l.id}`"
        class="group relative block overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] sm:p-5"
      >
        <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div class="flex flex-col gap-3 pl-1 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-base font-medium tracking-tight text-secondary-900 transition-colors group-hover:text-primary-900">{{ l.nom }}</h3>
              <Pill tone="primary">{{ labelOfAutre(logicielCategories, l.categorie, l.categoriePrecision) }}</Pill>
            </div>
            <p
              v-if="l.editeur"
              class="mt-1 truncate text-sm text-secondary-500"
            >{{ l.editeur }}{{ l.version ? ` · ${l.version}` : '' }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <Pill :tone="statutTone(l.statut)">{{ labelOf(logicielStatuts, l.statut) }}</Pill>
            <Pill
              v-if="l.typeLicence"
              tone="blue"
            >{{ labelOfAutre(logicielLicences, l.typeLicence, l.typeLicencePrecision) }}</Pill>
          </div>
        </div>
      </NuxtLink>
    </section>

    <ImportDialog
      v-if="showImport"
      endpoint="postes"
      natural-key="nom"
      label="Logiciels postes de travail"
      :fields="importFields"
      @close="showImport = false"
      @imported="showImport = false; refresh()"
    />
  </div>
</template>
