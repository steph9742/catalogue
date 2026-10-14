<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { UIButton, useToast } from '@catalogue/ui'
import { catalogues, type CatalogueColumn } from '~/utils/catalogues'
import { labelOfAutre } from '~/utils/catalogueEnums'
import { columnTone } from '~/utils/pillTones'
import { libelleGravite } from '~/utils/graviteIncident'
import { exportTable, type ExportColumn, type ExportFormat } from '~/utils/tableExport'
import ImportDialog from '~/components/catalogue/ImportDialog.vue'
import CatalogueFilterBar from '~/components/catalogue/CatalogueFilterBar.vue'
import CatalogueBulkBar from '~/components/catalogue/CatalogueBulkBar.vue'
import CatalogueTable from '~/components/catalogue/CatalogueTable.vue'
import CatalogueColonnes from '~/components/catalogue/CatalogueColonnes.vue'
import Pill from '~/components/ui/Pill.vue'

const route = useRoute()
const key = route.params.catalogue as string
const config = catalogues[key]
if (!config) throw createError({ statusCode: 404, statusMessage: 'Catalogue inconnu' })

const api = useApi()
const perms = await usePermissions()
const writable = computed(() => perms.canWrite(config.key))
const proposable = computed(() => perms.canPropose(config.key))

// Recherche + filtres + tri. Déclarés AVANT le chargement car, en mode paginé, ils
// pilotent la requête serveur (et sont donc surveillés par useAsyncData).
const search = ref('')
const activeFilters = ref<Record<string, (string | number)[]>>({})
const sortKey = ref('__title')
const sortDir = ref<'asc' | 'desc'>('asc')

// Pagination serveur (gros catalogues) vs chargement complet + filtrage client.
const paginated = !!config.paginated
const PAGE_SIZE = 50
const page = ref(1)

// Construit la query serveur à partir de la recherche/filtres/tri courants.
const serverQuery = () => {
  const p = new URLSearchParams()
  p.set('page', String(page.value))
  p.set('pageSize', String(PAGE_SIZE))
  if (search.value.trim()) p.set('q', search.value.trim())
  // '__title' n'est pas une colonne : on retombe sur la clé naturelle côté serveur.
  p.set('sort', sortKey.value === '__title' ? config.naturalKey : sortKey.value)
  p.set('dir', sortDir.value)
  for (const [k, vals] of Object.entries(activeFilters.value)) {
    if (vals?.length) p.set(k, vals.map(String).join(','))
  }
  return p.toString()
}

// Clé unique de la requête serveur : une seule source de vérité pour re-déclencher le
// chargement, robuste aux filtres mutés en place (un watch sur l'objet raterait ça).
const queryKey = computed(() => (paginated ? serverQuery() : ''))

type Page = { rows: Record<string, unknown>[], total: number }
const { data, pending, error, refresh } = await useAsyncData<Record<string, unknown>[] | Page>(
  `cat-${key}`,
  () => paginated
    ? api<Page>(`/api/${config.endpoint}?${queryKey.value}`)
    : api<Record<string, unknown>[]>(`/api/${config.endpoint}`),
  { getCachedData: () => undefined, watch: paginated ? [queryKey] : [] },
)

// Normalisation : le serveur renvoie { rows, total } en paginé, un tableau sinon.
const rows = computed<Record<string, unknown>[]>(() =>
  paginated ? ((data.value as Page)?.rows ?? []) : ((data.value as Record<string, unknown>[]) ?? []))
const total = computed(() => paginated ? ((data.value as Page)?.total ?? 0) : rows.value.length)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

// LE TOTAL SANS FILTRE, pour que le total filtré ait un dénominateur. « 213 serveurs » sur un
// écran où un filtre a été posé trois clics plus tôt se lit comme le parc entier.
const filtreActif = computed(() =>
  !!search.value.trim() || Object.values(activeFilters.value).some(v => v?.length))

const { data: totalSansFiltre } = await useAsyncData(
  () => `total-${config.endpoint}`,
  async () => {
    if (!paginated || !filtreActif.value) return null
    const d = await api<Page>(`/api/${config.endpoint}?pageSize=1`)
    return d?.total ?? null
  },
  { watch: [filtreActif], default: () => null },
)

// Revenir en page 1 dès qu'un critère change (sinon on peut viser une page vide).
const { lienPartageable } = useListeUrl({ search, filtres: activeFilters, triCle: sortKey, triSens: sortDir, page })

// Revenir en page 1 dès qu'un critère change — enregistré APRÈS la lecture de l'URL,
// pour que l'hydratation d'un lien partagé (qui porte sa propre page) ne le déclenche pas.
if (paginated) {
  watch([search, activeFilters, sortKey, sortDir], () => {
    page.value = 1
  }, { deep: true })
}

const { newToast } = useToast()
const copierLien = async () => {
  try {
    await navigator.clipboard.writeText(lienPartageable())
    newToast({ type: 'success', title: 'Lien copié', message: 'Il ouvre cette liste avec les mêmes filtres.', icon: 'lucide:link' })
  }
  catch { newToast({ type: 'error', title: 'Copie impossible', icon: 'lucide:alert-circle' }) }
}

// --- Sélection multiple -------------------------------------------------------------
// Portée volontairement limitée à la PAGE affichée : proposer « tout sélectionner » sur
// 7 600 lignes invisibles inviterait à des gestes dont on ne mesure pas la portée.
const selection = ref<Set<string>>(new Set())
const bascule = (id: string) => {
  const s = new Set(selection.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selection.value = s
}
const toutSelectionne = computed(() => displayed.value.length > 0 && displayed.value.every(r => selection.value.has(String(r.id))))
const basculerTout = () => {
  selection.value = toutSelectionne.value ? new Set() : new Set(displayed.value.map(r => String(r.id)))
}
const idsSelectionnes = computed(() => [...selection.value])
const apercuSelection = computed(() =>
  displayed.value.filter(r => selection.value.has(String(r.id))).map(r => titleOf(r)))

// Champs modifiables en masse : les énumérations et les rattachements (composante, service…).
const champsModifiables = computed(() => [
  ...config.columns.filter(c => !!c.options && c.key !== config.naturalKey)
    .map(c => ({ key: c.key, label: c.label, options: c.options! as { value: string, label: string }[] })),
  ...refFields.map(f => ({ key: f.key, label: f.label, options: refOptions[f.key] ?? [] })),
])

// Filtre courant sous la forme attendue par le serveur — identique à celui de la liste,
// pour que « tous les résultats » désigne exactement ce qui est affiché comme filtré.
const filtreCourant = computed(() => {
  const f: Record<string, string> = {}
  if (search.value.trim()) f.q = search.value.trim()
  for (const [k, vals] of Object.entries(activeFilters.value)) if (vals?.length) f[k] = vals.map(String).join(',')
  return f
})

const apresLot = async () => {
  selection.value = new Set()
  await refresh()
}

// --- Mode d'affichage : cartes pour parcourir, tableau pour analyser ----------------
const vue = useVueCatalogue(config)
await vue.charger()

// Trier depuis un en-tête de colonne : même clé → on inverse le sens.
const trierPar = (cle: string) => {
  if (sortKey.value === cle) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = cle
    sortDir.value = 'asc'
  }
}

// --- Navigation au clavier ----------------------------------------------------------
// j / k pour parcourir, Entrée pour ouvrir, Espace pour cocher, Échap pour désélectionner.
// Trier 1 200 machines à la souris est lent ; ces touches suivent l'usage établi.
const curseur = ref(-1)
const auClavier = (e: KeyboardEvent) => {
  const cible = e.target as HTMLElement | null
  if (cible && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)) return
  const n = displayed.value.length
  if (!n) return
  if (e.key === 'j' || e.key === 'ArrowDown') {
    curseur.value = Math.min(curseur.value + 1, n - 1)
    e.preventDefault()
  }
  else if (e.key === 'k' || e.key === 'ArrowUp') {
    curseur.value = Math.max(curseur.value - 1, 0)
    e.preventDefault()
  }
  else if (e.key === 'Enter' && curseur.value >= 0) {
    void navigateTo(`/${config.key}/${displayed.value[curseur.value]!.id}`)
  }
  else if (e.key === ' ' && curseur.value >= 0) {
    bascule(String(displayed.value[curseur.value]!.id))
    e.preventDefault()
  }
  else if (e.key === 'Escape') {
    selection.value = new Set()
    curseur.value = -1
  }
}
onMounted(() => window.addEventListener('keydown', auClavier))
onBeforeUnmount(() => window.removeEventListener('keydown', auClavier))

const showImport = ref(false)

const text = (col: CatalogueColumn, row: Record<string, unknown>): string => {
  const v = row[col.key]
  if (col.options) return labelOfAutre(col.options, v as string, row[col.autreKey ?? ''] as string)
  if (col.bool) return v ? 'oui' : 'non'
  return v == null || v === '' ? '—' : String(v)
}

// Colonnes à afficher en pill (enum/booléen) et en sous-titre (texte), hors clé de titre.
const pillCols = config.columns.filter(c => (c.options || c.bool) && c.key !== config.naturalKey)
// Une pastille « — » n'apprend rien : elle occupe la place d'une information sans en porter
// aucune, et sur une carte dense elle noie celles qui en portent.
const pillsRenseignees = (row: Record<string, unknown>) =>
  pillCols.filter(c => row[c.key] !== null && row[c.key] !== undefined && row[c.key] !== '')
const textCols = config.columns.filter(c => !c.options && !c.bool && c.key !== config.naturalKey)
// Chaîne d'ancêtres (relations supérieures) affichée en pills sous le nom, pour les
// unités d'organisation et les personnes.
const chainEndpoints = ['poles', 'services', 'departements', 'composantes', 'personnes']
const orgTree = chainEndpoints.includes(config.endpoint) ? await useOrgTree() : null
const chainPills = (row: Record<string, unknown>) => (orgTree ? orgTree.chainOf(config.endpoint, row) : [])
const chipCls: Record<string, string> = {
  primary: 'border-primary-200 bg-primary-50 text-primary-700',
  purple: 'border-purple-200 bg-purple-50 text-purple-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  gray: 'border-secondary-200 bg-secondary-50 text-secondary-600',
}
const titleOf = (row: Record<string, unknown>) =>
  config.endpoint === 'personnes'
    ? (`${row.prenom ? row.prenom + ' ' : ''}${row.nom ?? ''}`.trim() || String(row[config.naturalKey] ?? row.id))
    : String(row[config.naturalKey] ?? row.nom ?? row.id)
const subtitleOf = (row: Record<string, unknown>) =>
  config.endpoint === 'personnes' ? String(row.fonction ?? '') : (textCols.length ? text(textCols[0]!, row) : '')

// Références structurelles (parents) pour filtrer/trier par nom du parent.
const refFields = config.fields.filter(f => f.type === 'ref' && f.endpoint && f.endpoint !== 'personnes')
const refOptions = reactive<Record<string, { value: string, label: string }[]>>({})
for (const f of refFields) {
  refOptions[f.key] = await useRefLabels(f.endpoint!, f.labelKey)
}

// Recherche + filtres (enum, booléen, parent) + tri — refs déclarées plus haut.
const boolCols = config.columns.filter(c => c.bool && c.key !== config.naturalKey)
const filterDefs = computed(() => [
  ...config.columns.filter(c => !!c.options).map(c => ({ key: c.key, label: c.label, options: c.options! })),
  ...boolCols.map(c => ({ key: c.key, label: c.label, options: [{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }] })),
  ...refFields.map(f => ({ key: f.key, label: f.label, options: refOptions[f.key] ?? [] })),
])
const sortOptions = computed(() => [
  { value: '__title', label: 'Nom' },
  ...config.columns.filter(c => c.options || c.bool).map(c => ({ value: c.key, label: c.label })),
  ...refFields.map(f => ({ value: f.key, label: f.label })),
])

const filtered = computed(() => {
  let list = rows.value ?? []
  for (const [k, vals] of Object.entries(activeFilters.value)) {
    if (!vals?.length) continue
    const set = vals.map(String)
    list = list.filter(r => set.includes(String(r[k] ?? '')))
  }
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter(r => [titleOf(r), ...config.columns.map(c => text(c, r)), ...chainPills(r).map(p => p.label)].join(' ').toLowerCase().includes(q))
  return list
})
const sortVal = (row: Record<string, unknown>, k: string): string => {
  if (k === '__title') return titleOf(row).toLowerCase()
  const col = config.columns.find(c => c.key === k)
  // Les énumérations se trient dans LEUR ORDRE DE DÉCLARATION, pas par ordre alphabétique de
  // leur libellé.
  if (col?.options) {
    const rang = col.options.findIndex(o => o.value === String(row[k] ?? ''))
    // Valeur absente ou inconnue : rejetée en fin de liste plutôt qu'en tête.
    return String(rang < 0 ? 999 : rang).padStart(3, '0')
  }
  if (col?.bool) return row[k] ? '1' : '0'
  if (refFields.some(f => f.key === k)) return (refOptions[k]?.find(o => o.value === String(row[k]))?.label ?? '').toLowerCase()
  return String(row[k] ?? '').toLowerCase()
}
const sorted = computed(() => {
  const arr = [...filtered.value]
  arr.sort((a, b) => {
    const va = sortVal(a, sortKey.value)
    const vb = sortVal(b, sortKey.value)
    return (va < vb ? -1 : va > vb ? 1 : 0) * (sortDir.value === 'asc' ? 1 : -1)
  })
  return arr
})
// En mode paginé, le serveur a déjà recherché/filtré/trié : on affiche `rows` tel quel.
const displayed = computed(() => paginated ? rows.value : sorted.value)
const hasQuery = computed(() => !!search.value.trim() || Object.values(activeFilters.value).some(v => v?.length))

const exportColumns: ExportColumn<Record<string, unknown>>[] = config.columns.map(c => ({
  header: c.label,
  value: (row: Record<string, unknown>) => (c.options ? labelOfAutre(c.options, row[c.key] as string, row[c.autreKey ?? ''] as string) : c.bool ? (row[c.key] ? 'oui' : 'non') : (row[c.key] == null ? '' : String(row[c.key]))),
}))

const exporting = ref(false)
const doExport = async (format: ExportFormat) => {
  // En paginé, `rows` n'est que la page courante : on récupère l'ensemble filtré
  // complet (sans page) pour ne pas exporter un sous-ensemble trompeur.
  let r = rows.value ?? []
  if (paginated) {
    exporting.value = true
    try {
      const p = new URLSearchParams()
      if (search.value.trim()) p.set('q', search.value.trim())
      for (const [k, vals] of Object.entries(activeFilters.value)) if (vals?.length) p.set(k, vals.map(String).join(','))
      r = await api<Record<string, unknown>[]>(`/api/${config.endpoint}?${p.toString()}`)
    }
    finally { exporting.value = false }
  }
  if (r.length) void exportTable(r, exportColumns, config.endpoint, format)
}

const onImported = () => {
  showImport.value = false
  refresh()
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          {{ config.label }}
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Catalogue — {{ config.label.toLowerCase() }}.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UIButton
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          :disabled="!rows?.length"
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
          :disabled="!rows?.length"
          @click="doExport('ods')"
        >
          <Icon
            name="lucide:download"
            class="size-4"
          /> LibreOffice
        </UIButton>
        <div class="inline-flex overflow-hidden rounded-lg border border-secondary-200/80">
          <button
            v-for="m in [{ v: 'cartes', i: 'lucide:layout-grid', t: 'Cartes — pour parcourir' }, { v: 'tableau', i: 'lucide:table', t: 'Tableau — pour comparer et trier' }]"
            :key="m.v"
            class="px-2.5 py-2 text-sm transition-colors"
            :class="vue.mode.value === m.v ? 'bg-primary-600 text-white' : 'text-secondary-600 hover:bg-secondary-50'"
            :title="m.t"
            @click="vue.mode.value = m.v as 'cartes' | 'tableau'"
          >
            <Icon
              :name="m.i"
              class="size-4"
            />
          </button>
        </div>
        <CatalogueColonnes
          v-if="vue.mode.value === 'tableau'"
          :possibles="vue.colonnesPossibles.value"
          :choisies="vue.colonnes.value"
          @basculer="vue.basculerColonne"
          @deplacer="vue.deplacerColonne"
          @reinitialiser="vue.reinitialiser"
        />
        <UIButton
          v-if="hasQuery"
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          title="Copier un lien vers cette vue filtrée"
          @click="copierLien"
        >
          <Icon
            name="lucide:link"
            class="size-4"
          /> Partager la vue
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
          @click="navigateTo(`/${config.key}/new`)"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Nouveau
        </UIButton>
      </div>
    </header>

    <CatalogueFilterBar
      v-if="paginated || rows.length"
      v-model:search="search"
      v-model:active="activeFilters"
      v-model:sort="sortKey"
      v-model:sort-dir="sortDir"
      :filters="filterDefs"
      :sort-options="sortOptions"
      :perimetre="config.label"
      :resultats="total"
    />

    <!-- LE DÉCOMPTE DES RÉSULTATS, avec son dénominateur quand un filtre est actif. -->
    <p
      v-if="paginated && displayed.length"
      class="px-0.5 text-xs text-secondary-500"
    >
      <span class="font-medium text-secondary-700">{{ total.toLocaleString('fr-FR') }}</span>
      {{ config.singular }}{{ total > 1 ? 's' : '' }}
      <template v-if="filtreActif">
        <template v-if="totalSansFiltre">
          sur {{ totalSansFiltre.toLocaleString('fr-FR') }} — filtre actif
        </template>
        <template v-else>
          — filtre actif
        </template>
      </template>
    </p>

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
      v-else-if="!displayed.length && !hasQuery"
      class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
        <Icon
          :name="config.icon"
          class="size-7 text-primary-600"
        />
      </div>
      <p class="font-medium text-secondary-600">
        Aucune entrée dans {{ config.label.toLowerCase() }}.
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-secondary-500">
        Ce catalogue se remplit à la main, par import d'un fichier, ou depuis l'inventaire GLPI.
      </p>
      <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
        <UIButton
          v-if="proposable"
          variant="primary"
          @click="navigateTo(`/${config.key}/new`)"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Créer la première entrée
        </UIButton>
        <UIButton
          v-if="writable"
          variant="outline"
          @click="showImport = true"
        >
          <Icon
            name="lucide:upload"
            class="size-4"
          /> Importer un fichier
        </UIButton>
        <UIButton
          variant="outline"
          @click="navigateTo('/glpi')"
        >
          <Icon
            name="lucide:refresh-cw"
            class="size-4"
          /> Synchroniser GLPI
        </UIButton>
      </div>
    </section>

    <section
      v-else-if="!displayed.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center"
    >
      <p class="text-sm text-secondary-600">
        Aucun résultat pour ces critères.
      </p>
      <p class="mt-1 text-xs text-secondary-500">
        {{ (totalSansFiltre ?? total).toLocaleString('fr-FR') }} entrée{{ (totalSansFiltre ?? total) > 1 ? 's' : '' }} au total dans {{ config.label.toLowerCase() }}, sans filtre.
      </p>
      <button
        class="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-secondary-200 px-3 py-1.5 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
        @click="search = ''; activeFilters = {}"
      >
        <Icon
          name="lucide:filter-x"
          class="size-4"
        /> Effacer les filtres
      </button>
    </section>

    <template v-else>
      <div
        v-if="writable && vue.mode.value === 'cartes'"
        class="flex items-center gap-2 px-1"
      >
        <input
          :id="`tout-${config.key}`"
          type="checkbox"
          class="size-4 rounded border-secondary-300 text-primary-600"
          :checked="toutSelectionne"
          @change="basculerTout"
        >
        <label
          :for="`tout-${config.key}`"
          class="cursor-pointer text-xs text-secondary-500"
        >
          Tout sélectionner sur cette page ({{ displayed.length }})
        </label>
        <span class="ml-auto hidden font-mono text-[10px] uppercase tracking-widest text-secondary-300 sm:inline">
          j / k parcourir · entrée ouvrir · espace cocher
        </span>
      </div>

      <CatalogueTable
        v-if="vue.mode.value === 'tableau'"
        :config="config"
        :lignes="displayed"
        :colonnes="vue.colonnes.value"
        :tri-cle="sortKey"
        :tri-sens="sortDir"
        :selection="selection"
        :selectionnable="writable"
        :curseur="curseur"
        :titre-de="titleOf"
        @trier="trierPar"
        @basculer="bascule"
        @basculer-tout="basculerTout"
      />

      <section
        v-else
        class="grid grid-cols-1 gap-3"
      >
        <div
          v-for="(row, i) in displayed"
          :key="String(row.id)"
          class="group relative flex items-start gap-3 overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] sm:p-5"
          :class="[
            selection.has(String(row.id)) ? 'border-primary-300 bg-primary-50/30' : 'border-secondary-200/60',
            curseur === i ? 'ring-2 ring-primary-400/40' : '',
          ]"
        >
          <input
            v-if="writable"
            type="checkbox"
            class="mt-1 size-4 shrink-0 rounded border-secondary-300 text-primary-600"
            :checked="selection.has(String(row.id))"
            :aria-label="`Sélectionner ${titleOf(row)}`"
            @change="bascule(String(row.id))"
          >
          <NuxtLink
            :to="`/${config.key}/${row.id}`"
            class="min-w-0 flex-1"
          >
            <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div class="flex flex-col gap-3 pl-1 md:flex-row md:items-center md:justify-between">
              <div class="flex min-w-0 items-center gap-3">
                <Icon
                  :name="config.icon"
                  class="size-5 shrink-0 text-secondary-400 transition-colors group-hover:text-primary-500"
                />
                <div class="min-w-0">
                  <h3 class="truncate text-base font-medium tracking-tight text-secondary-900 transition-colors group-hover:text-primary-900">{{ titleOf(row) }}</h3>
                  <p
                    v-if="subtitleOf(row) && subtitleOf(row) !== '—'"
                    class="truncate text-sm text-secondary-500"
                  >{{ subtitleOf(row) }}</p>
                  <div
                    v-if="chainPills(row).length"
                    class="mt-1.5 flex flex-wrap gap-1"
                  >
                    <span
                      v-for="(p, i) in chainPills(row)"
                      :key="i"
                      class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium"
                      :class="chipCls[p.tone]"
                    >{{ p.label }}</span>
                  </div>
                </div>
              </div>
              <div
                v-if="pillCols.length || row.eolStatut"
                class="flex shrink-0 flex-wrap items-center gap-2"
              >
                <!-- Incident ouvert : c'est ce qui appelle une action MAINTENANT, donc en premier. -->
                <Pill
                  v-if="row.incidentOuvert"
                  tone="red"
                  :title="`Incident ${libelleGravite(row.incidentGravite as string)} en cours dans Sniff`"
                >
                  <Icon
                    name="lucide:siren"
                    class="size-3"
                  /> Incident
                </Pill>
                <!-- Fin de support : champ calculé par le serveur depuis le référentiel OS (page « Fin de vie »). -->
                <Pill
                  v-if="row.eolStatut === 'depasse'"
                  tone="red"
                  :title="row.eolFinDeVie ? `Support terminé le ${String(row.eolFinDeVie)}` : 'Système hors support'"
                >
                  <Icon
                    name="lucide:shield-x"
                    class="size-3"
                  /> Fin de support
                </Pill>
                <Pill
                  v-else-if="row.eolStatut === 'etendu'"
                  tone="amber"
                  :title="row.eolFinDeVieEtendue ? `Support étendu jusqu'au ${String(row.eolFinDeVieEtendue)}` : 'Sous support étendu'"
                >
                  <Icon
                    name="lucide:shield-alert"
                    class="size-3"
                  /> Support étendu
                </Pill>
                <Pill
                  v-for="c in pillsRenseignees(row)"
                  :key="c.key"
                  :tone="c.bool ? (row[c.key] ? 'emerald' : 'gray') : columnTone(config.key, c.key, row[c.key])"
                >{{ text(c, row) }}</Pill>
              </div>
            </div>
          </NuxtLink>
        </div>
      </section>

      <CatalogueBulkBar
        v-if="writable && idsSelectionnes.length"
        :config="config"
        :ids="idsSelectionnes"
        :apercu="apercuSelection"
        :champs-modifiables="champsModifiables"
        :supprimable="writable"
        :filtre="filtreCourant"
        :total-filtre="total"
        @termine="apresLot"
        @vider="selection = new Set()"
      />
    </template>

    <nav
      v-if="paginated && total > PAGE_SIZE"
      class="flex items-center justify-between gap-3 pt-1"
    >
      <span class="font-mono text-[11px] uppercase tracking-widest text-secondary-400">
        {{ (page - 1) * PAGE_SIZE + 1 }}–{{ Math.min(page * PAGE_SIZE, total) }} sur {{ total }}
      </span>
      <div class="flex items-center gap-2">
        <button
          :disabled="page <= 1 || pending"
          class="inline-flex items-center gap-1 rounded-lg border border-secondary-200/80 px-3 py-1.5 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-40"
          @click="page--"
        >
          <Icon
            name="lucide:chevron-left"
            class="size-4"
          /> Précédent
        </button>
        <span class="font-mono text-xs text-secondary-500">{{ page }} / {{ pageCount }}</span>
        <button
          :disabled="page >= pageCount || pending"
          class="inline-flex items-center gap-1 rounded-lg border border-secondary-200/80 px-3 py-1.5 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-40"
          @click="page++"
        >
          Suivant <Icon
            name="lucide:chevron-right"
            class="size-4"
          />
        </button>
      </div>
    </nav>

    <ImportDialog
      v-if="showImport"
      :endpoint="config.endpoint"
      :natural-key="config.naturalKey"
      :label="config.label"
      :fields="[...config.fields, ...(config.importRefs ?? [])]"
      @close="showImport = false"
      @imported="onImported"
    />
  </div>
</template>
