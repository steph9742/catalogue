<script setup lang="ts">
// CATALOGUE RGPD — les traitements portés par les applications, et leur conformité.
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
import PastilleRgpd from '~/components/rgpd/PastilleRgpd.vue'
import { exportTable, type ExportColumn, type ExportFormat } from '~/utils/tableExport'
import { labelOf, appSensibilites, appExpositions, appCriticites } from '~/utils/catalogueEnums'
import { appExpositionTone, appCriticiteTone } from '~/utils/pillTones'

type App = Record<string, unknown> & {
  id: string
  nom: string
  donneesPersonnelles?: boolean
  etatRgpd?: 'hors_perimetre' | 'non_evalue' | 'ecart' | 'conforme'
  rgpdEcarts?: number
  rgpdEvaluees?: number
  rgpdTotal?: number
  aipdStatut?: string | null
  aipdConclusion?: string | null
}

const api = useApi()
const { data: apps } = await useAsyncData('rgpd', () => api<App[]>('/api/applications'), { getCachedData: () => undefined })

const concernees = computed(() => (apps.value ?? []).filter(a => a.donneesPersonnelles))

const compte = (p: (a: App) => boolean) => computed(() => concernees.value.filter(p).length)
const nbEcart = compte(a => a.etatRgpd === 'ecart')
const nbNonEvaluees = compte(a => a.etatRgpd === 'non_evalue')
const nbAipd = compte(a => !!a.aipdStatut && a.aipdStatut !== 'non_requise')
const nbConsultationCnil = compte(a => a.aipdConclusion === 'risque_eleve_consultation')

// --- Filtres : la barre partagée des catalogues -------------------------------------------
// Réutilise `CatalogueFilterBar` plutôt que des puces maison : recherche, filtres
// multi-valeurs, tri et rappel des filtres actifs, exactement comme sur Serveurs ou
// Applications.
const search = ref('')
const activeFilters = ref<Record<string, (string | number)[]>>({})
const sortKey = ref('nom')
const sortDir = ref<'asc' | 'desc'>('asc')

const FILTRES = [
  { key: 'etatRgpd', label: 'Conformité', options: [
    { value: 'ecart', label: 'Écart constaté' },
    { value: 'non_evalue', label: 'Non évaluée' },
    { value: 'conforme', label: 'Conforme' },
  ] },
  { key: 'aipdStatut', label: 'Analyse d\'impact', options: [
    { value: 'non_requise', label: 'Non requise' },
    { value: 'a_faire', label: 'À faire' },
    { value: 'en_cours', label: 'En cours' },
    { value: 'terminee', label: 'Terminée' },
  ] },
  { key: 'aipdConclusion', label: 'Conclusion AIPD', options: [
    { value: 'risque_acceptable', label: 'Risque acceptable' },
    { value: 'acceptable_sous_reserve', label: 'Sous réserve' },
    { value: 'risque_eleve_consultation', label: 'Risque élevé — CNIL' },
    { value: 'traitement_modifie', label: 'Traitement modifié' },
  ] },
]

const TRIS = [
  { value: 'nom', label: 'Nom' },
  { value: 'ecarts', label: 'Nombre d\'écarts' },
  { value: 'criticite', label: 'Criticité' },
]

// Une application sans analyse d'impact n'a pas de statut : on la rattache à « non requise »
// pour qu'elle reste filtrable, plutôt que de la rendre introuvable.
const valeur = (a: App, cle: string) =>
  cle === 'aipdStatut' ? (a.aipdStatut ?? 'non_requise') : (a[cle] as string | null | undefined)

const listees = computed(() => {
  const q = search.value.trim().toLowerCase()
  const gardees = concernees.value.filter((a) => {
    if (q && !String(a.nom).toLowerCase().includes(q)) return false
    for (const [cle, vals] of Object.entries(activeFilters.value)) {
      if (!vals?.length) continue
      if (!vals.includes(valeur(a, cle) ?? '')) return false
    }
    return true
  })
  const sens = sortDir.value === 'asc' ? 1 : -1
  return [...gardees].sort((x, y) => {
    if (sortKey.value === 'ecarts') return ((x.rgpdEcarts ?? 0) - (y.rgpdEcarts ?? 0)) * sens
    if (sortKey.value === 'criticite') return String(x.criticite ?? '').localeCompare(String(y.criticite ?? '')) * sens
    return String(x.nom).localeCompare(String(y.nom), 'fr') * sens
  })
})

const LIBELLE_ETAT: Record<string, string> = {
  ecart: 'Écart constaté', non_evalue: 'Non évaluée', conforme: 'Conforme', hors_perimetre: '—',
}

const columns: ExportColumn<App>[] = [
  { header: 'Application', value: a => a.nom },
  { header: 'Criticité', value: a => labelOf(appCriticites, a.criticite as string) },
  { header: 'Sensibilité', value: a => labelOf(appSensibilites, a.sensibilite as string) },
  { header: 'Exposition', value: a => labelOf(appExpositions, a.exposition as string) },
  { header: 'Conformité RGPD', value: a => LIBELLE_ETAT[a.etatRgpd ?? ''] ?? '' },
  { header: 'Exigences évaluées', value: a => `${a.rgpdEvaluees ?? 0}/${a.rgpdTotal ?? 0}` },
  { header: 'Écarts', value: a => String(a.rgpdEcarts ?? 0) },
  { header: 'AIPD', value: a => a.aipdStatut ?? 'non_requise' },
  { header: 'Conclusion AIPD', value: a => a.aipdConclusion ?? '' },
  { header: 'Homologuée', value: a => (a.homologuee ? 'oui' : 'non') },
]
const doExport = (f: ExportFormat) => {
  if (listees.value.length) void exportTable(listees.value, columns, 'catalogue-rgpd', f)
}

// `alerte` teinte la tuile en rouge : réservé à ce qui appelle une action, jamais décoratif.
const TUILES = computed(() => [
  { label: 'Traitements', n: concernees.value.length, sub: 'applications concernées', icon: 'lucide:shield', alerte: false },
  { label: 'Écarts constatés', n: nbEcart.value, sub: 'exigences non conformes', icon: 'lucide:triangle-alert', alerte: nbEcart.value > 0 },
  { label: 'Non évaluées', n: nbNonEvaluees.value, sub: 'restent à examiner', icon: 'lucide:circle-dashed', alerte: false },
  {
    label: 'Analyses d\'impact',
    n: nbAipd.value,
    sub: nbConsultationCnil.value ? `dont ${nbConsultationCnil.value} à soumettre à la CNIL` : 'article 35',
    icon: 'lucide:file-search',
    alerte: nbConsultationCnil.value > 0,
  },
])

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Catalogue RGPD
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Applications traitant des données personnelles, et leur conformité aux exigences de <strong>sécurité</strong> du RGPD.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UIButton
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          :disabled="!listees.length"
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
          :disabled="!listees.length"
          @click="doExport('ods')"
        >
          <Icon
            name="lucide:download"
            class="size-4"
          /> LibreOffice
        </UIButton>
      </div>
    </header>

    <!-- Ce que cette page N'EST PAS. Sans cette mention, son titre laisserait croire que
         l'article 30 est satisfait — il ne l'est pas, et ce n'est pas son objet. -->
    <p class="px-1 text-xs text-secondary-500">
      <Icon
        name="lucide:info"
        class="mr-1 inline size-3.5 align-[-2px] text-secondary-400"
      />
      Ceci n'est <strong>pas le registre des activités de traitement</strong> de l'article 30, qui exige
      finalités, bases légales, catégories de personnes et de données, durées de conservation et destinataires.
      Ce catalogue couvre la <strong>sécurité</strong> des traitements — le registre relève du délégué à la protection des données.
    </p>

    <!-- Bandeau de synthèse — même forme que les autres pages de pilotage. -->
    <section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div
        v-for="t in TUILES"
        :key="t.label"
        :class="[TUILE, 'flex items-center gap-3']"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-xl border"
          :class="t.alerte ? 'border-red-100 bg-red-50' : 'border-primary-100 bg-primary-50'"
        >
          <Icon
            :name="t.icon"
            class="size-4"
            :class="t.alerte ? 'text-red-600' : 'text-primary-600'"
          />
        </span>
        <span>
          <span
            class="block text-xl font-semibold leading-none tracking-tight"
            :class="t.alerte ? 'text-red-700' : 'text-secondary-900'"
          >{{ t.n }}</span>
          <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
          <span class="block text-[10px] text-secondary-400">{{ t.sub }}</span>
        </span>
      </div>
    </section>

    <CatalogueFilterBar
      v-if="concernees.length"
      v-model:search="search"
      v-model:active="activeFilters"
      v-model:sort="sortKey"
      v-model:sort-dir="sortDir"
      :filters="FILTRES"
      :sort-options="TRIS"
      :placeholder="`Rechercher parmi ${concernees.length} traitement${concernees.length > 1 ? 's' : ''}…`"
    />

    <section
      v-if="!concernees.length"
      class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-purple-200/60 bg-purple-100/50 shadow-inner">
        <Icon
          name="lucide:shield"
          class="size-7 text-purple-600"
        />
      </div>
      <p class="font-medium text-secondary-600">
        Aucune application ne déclare traiter de données personnelles.
      </p>
      <p class="mx-auto mt-1 max-w-md text-xs text-secondary-500">
        La case « données personnelles » se coche sur la fiche de chaque application.
      </p>
    </section>

    <section
      v-else-if="!listees.length"
      class="rounded-2xl border border-dashed border-secondary-300 py-16 text-center"
    >
      <p class="text-sm font-medium text-secondary-700">
        Aucune application ne correspond à ces filtres.
      </p>
    </section>

    <section
      v-else
      class="grid grid-cols-1 gap-3"
    >
      <NuxtLink
        v-for="a in listees"
        :key="a.id"
        :to="`/applications/${a.id}`"
        class="group relative block overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] sm:p-5"
        :class="a.etatRgpd === 'ecart' ? '!border-red-200' : ''"
      >
        <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div class="flex flex-col gap-3 pl-1 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <PastilleRgpd
              :etat="a.etatRgpd"
              :ecarts="a.rgpdEcarts"
              :evaluees="a.rgpdEvaluees"
              :total="a.rgpdTotal"
              :aipd-statut="a.aipdStatut"
              :aipd-conclusion="a.aipdConclusion"
            />
            <h3 class="truncate text-base font-medium tracking-tight text-secondary-900 group-hover:text-primary-900">{{ a.nom }}</h3>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <span
              v-if="a.etatRgpd === 'non_evalue'"
              class="font-mono text-[10px] uppercase tracking-wide text-secondary-400"
            >
              {{ a.rgpdEvaluees ?? 0 }}/{{ a.rgpdTotal ?? 0 }} évaluées
            </span>
            <Pill
              v-if="a.criticite"
              :tone="appCriticiteTone(a.criticite as string)"
            >{{ labelOf(appCriticites, a.criticite as string) }}</Pill>
            <Pill
              v-if="a.exposition"
              :tone="appExpositionTone(a.exposition as string)"
            >{{ labelOf(appExpositions, a.exposition as string) }}</Pill>
            <Pill :tone="a.homologuee ? 'emerald' : 'gray'">{{ a.homologuee ? 'Homologuée' : 'Non homologuée' }}</Pill>
          </div>
        </div>
      </NuxtLink>
    </section>
  </div>
</template>
