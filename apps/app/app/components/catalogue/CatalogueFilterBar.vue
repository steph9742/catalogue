<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { UIButton, UISelect } from '@catalogue/ui'
import type { EnumOption } from '~/utils/catalogueEnums'

const props = defineProps<{
  filters?: { key: string, label: string, options: EnumOption[] }[]
  sortOptions?: { value: string, label: string }[]
  placeholder?: string
  /** Nom du catalogue courant : « Rechercher dans les serveurs ». Le champ dit son
   *  PÉRIMÈTRE, ce qui le distingue de la recherche globale sans rien déplacer. */
  perimetre?: string
  /** Nombre de résultats du filtre courant, affiché sur le bouton de validation. */
  resultats?: number
}>()

const search = defineModel<string>('search', { default: '' })
const active = defineModel<Record<string, (string | number)[]>>('active', { default: () => ({}) })
const sort = defineModel<string>('sort', { default: '' })
const sortDir = defineModel<'asc' | 'desc'>('sortDir', { default: 'asc' })

// REPLI AU DÉFILEMENT. La barre fait cinq lignes : la garder déployée en collant mangerait un
// quart de l'écran.
const replie = ref(false)
// `ouvertMobile` : l'utilisateur a déployé la barre à la main. Le défilement ne la
// referme alors plus — sinon elle se replierait pendant qu'il choisit un filtre.
const ouvertMobile = ref(false)
const barre = ref<HTMLElement | null>(null)
// SAISIE EN COURS. Sur DESKTOP seulement : c'est la seule branche qui peut déplier au
// défilement, et donc la seule où la frappe posait problème.
const saisieEnCours = ref(false)
if (import.meta.client) {
  let dernier = 0
  const auDefilement = () => {
    const y = window.scrollY

    // LE VERROU SE RELÂCHE QUAND LA BARRE A QUITTÉ L'ÉCRAN PAR LE HAUT. Une première version ne
    // le relâchait jamais : après un déploiement à la main, la barre ne se repliait plus et ne
    // suivait plus le défilement, définitivement.
    if (ouvertMobile.value) {
      if ((barre.value?.getBoundingClientRect().bottom ?? 1) < 0) ouvertMobile.value = false
      dernier = y
      return
    }

    // Seuil de 120 px : sans lui, un micro-défilement ferait clignoter la barre.
    const versLeBas = y > 120 && y > dernier

    // SUR MOBILE, LE DÉFILEMENT NE FAIT QUE REPLIER. Il ne déplie jamais.
    if (window.innerWidth < 1024) {
      if (versLeBas) replie.value = true
    }
    else if (!saisieEnCours.value) {
      replie.value = versLeBas
    }
    dernier = y
  }
  onMounted(() => {
    // REPLIÉE D'EMBLÉE SOUS `lg`. Sur 375 px, la grille empile une ligne par filtre : six
    // filtres sur les serveurs, et la liste commence sous le premier écran.
    if (window.innerWidth < 1024) replie.value = true
    window.addEventListener('scroll', auDefilement, { passive: true })
  })
  onUnmounted(() => window.removeEventListener('scroll', auDefilement))
}

// La barre déployée vit EN HAUT de la page. La rouvrir depuis la ligne repliée, alors qu'on est
// au milieu d'une liste de plusieurs milliers de lignes, la fait réapparaître hors de l'écran :
// on croit qu'elle a disparu.
const deplier = () => {
  replie.value = false
  ouvertMobile.value = true
  nextTick(() => {
    barre.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // PAS DE FOCUS SUR LE CHAMP ICI. Ce bouton mène aux FILTRES : y ouvrir le clavier
    // masquerait la moitié de l'écran sur mobile, pour un geste qui ne concerne pas la frappe.
  })
}

const valuesOf = (key: string) => active.value[key] ?? []
const setValues = (key: string, vals: (string | number)[]) => {
  active.value = { ...active.value, [key]: vals }
}
const removeChip = (key: string, value: string | number) => setValues(key, valuesOf(key).filter(v => v !== value))

// Filtres à 2 options ou moins → sélection simple (cocher les deux ne filtrerait rien).
const singleItems = (f: { options: EnumOption[] }) => [{ value: '', label: 'Tous' }, ...f.options]
const singleModel = (key: string) => (valuesOf(key)[0] ?? '')
const setSingle = (key: string, val: string | number | (string | number)[] | null | undefined) => {
  const v = Array.isArray(val) ? val[0] : val
  setValues(key, v === '' || v == null ? [] : [v])
}

// Chips des filtres actifs (une par valeur sélectionnée).
const chips = computed(() => {
  const out: { key: string, dim: string, value: string | number, label: string }[] = []
  for (const f of props.filters ?? []) {
    for (const v of valuesOf(f.key)) {
      out.push({ key: f.key, dim: f.label, value: v, label: f.options.find(o => o.value === v)?.label ?? String(v) })
    }
  }
  return out
})
const hasActive = computed(() => search.value.trim() !== '' || chips.value.length > 0)
const reset = () => {
  search.value = ''
  active.value = {}
}

const labelCls = 'block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <!-- LIGNE REPLIÉE : le VRAI champ de recherche, pas son imitation. Une première version était un bouton qui dépliait la barre, remontait la page, et obligeait à recliquer sur le champ pour taper — trois gestes et un déplacement pour une frappe. -->
  <div
    v-if="replie && !ouvertMobile"
    class="sticky top-[4.75rem] z-20 mb-1 flex w-full items-center gap-2 rounded-xl border border-secondary-200/70 bg-white/95 py-1 pl-3 pr-1.5 shadow-sm shadow-secondary-200/30 backdrop-blur focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/20"
  >
    <Icon
      name="lucide:search"
      class="size-3.5 shrink-0 text-secondary-400"
    />
    <input
      v-model="search"
      type="search"
      :placeholder="perimetre ? `Rechercher dans les ${perimetre.toLowerCase()}` : 'Rechercher'"
      class="min-w-0 flex-1 border-0 bg-transparent py-1 text-[13px] text-secondary-900 outline-none placeholder:text-secondary-400"
      @focus="saisieEnCours = true"
      @blur="saisieEnCours = false"
    >
    <span
      v-if="chips.length"
      class="shrink-0 rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-primary-700"
    >{{ chips.length }}<span class="hidden sm:inline">&nbsp;filtre{{ chips.length > 1 ? 's' : '' }}</span></span>
    <!-- Le décompte porte son unité : « 912 » seul ne dit pas de quoi. Détaché par un filet, sinon il se lit dans la continuité du texte saisi. -->
    <span
      v-if="resultats !== undefined"
      class="hidden shrink-0 border-l border-secondary-200/70 pl-2 text-[11px] tabular-nums text-secondary-400 sm:inline"
    >{{ resultats.toLocaleString('fr-FR') }}<span
      v-if="perimetre"
      class="hidden sm:inline"
    >&nbsp;{{ perimetre.toLowerCase() }}</span></span>
    <!-- CIBLE DISTINCTE. Le champ sert à chercher, ce bouton à atteindre les filtres : deux intentions, deux zones cliquables. -->
    <button
      class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-secondary-400 transition-colors hover:bg-secondary-100 hover:text-secondary-700"
      aria-label="Afficher les filtres"
      @click="deplier()"
    >
      <Icon
        name="lucide:sliders-horizontal"
        class="size-4"
      />
    </button>
  </div>

  <section
    v-show="!replie || ouvertMobile"
    ref="barre"
    class="relative z-20 rounded-2xl border border-secondary-200/60 bg-secondary-50/50 p-4 shadow-sm shadow-secondary-200/20 sm:p-5"
  >
    <!-- Refermer : sans ce bouton, la barre déployée à la main sur mobile ne pourrait
         plus se replier, le défilement ne la touchant plus. -->
    <button
      v-if="ouvertMobile"
      class="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg text-secondary-400 transition-colors hover:bg-secondary-100 hover:text-secondary-700 lg:hidden"
      aria-label="Replier les filtres"
      @click="ouvertMobile = false; replie = true"
    >
      <Icon
        name="lucide:chevron-up"
        class="size-4"
      />
    </button>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <!-- Recherche -->
      <div class="space-y-1.5 xl:col-span-2">
        <label :class="labelCls">{{ perimetre ? `Rechercher dans les ${perimetre.toLowerCase()}` : 'Rechercher' }}</label>
        <div class="relative">
          <Icon
            name="lucide:search"
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400"
          />
          <input
            v-model="search"
            type="search"
            :placeholder="placeholder ?? (perimetre ? `Rechercher dans les ${perimetre.toLowerCase()}…` : 'Rechercher…')"
            class="w-full rounded-lg border border-secondary-200 bg-white py-2 pl-9 pr-3 text-sm text-secondary-900 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
          >
        </div>
      </div>

      <!-- Filtres multi-sélection -->
      <div
        v-for="f in filters"
        :key="f.key"
        class="space-y-1.5"
      >
        <label :class="labelCls">{{ f.label }}</label>
        <UISelect
          v-if="f.options.length > 2"
          class="!max-w-none"
          :items="f.options"
          :multi-select="true"
          :model-value="valuesOf(f.key)"
          :placeholder="`Tous`"
          @update:model-value="setValues(f.key, Array.isArray($event) ? $event : ($event == null ? [] : [$event]))"
        />
        <UISelect
          v-else
          class="!max-w-none"
          :items="singleItems(f)"
          :multi-select="false"
          :model-value="singleModel(f.key)"
          @update:model-value="setSingle(f.key, $event)"
        />
      </div>

      <!-- Tri -->
      <div
        v-if="sortOptions?.length"
        class="space-y-1.5"
      >
        <label :class="labelCls">Trier par</label>
        <div class="flex items-stretch gap-1.5">
          <UISelect
            class="!max-w-none"
            :items="sortOptions"
            :multi-select="false"
            :model-value="sort"
            @update:model-value="sort = String($event ?? '')"
          />
          <button
            type="button"
            :title="sortDir === 'asc' ? 'Croissant' : 'Décroissant'"
            class="shrink-0 rounded-lg border border-secondary-200 bg-white px-2.5 text-secondary-500 transition-colors hover:border-primary-300 hover:text-primary-600"
            @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
          >
            <Icon
              :name="sortDir === 'asc' ? 'lucide:arrow-down-a-z' : 'lucide:arrow-down-z-a'"
              class="size-4"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Filtres actifs -->
    <div
      v-if="hasActive"
      class="mt-4 flex flex-wrap items-center gap-2 border-t border-secondary-100 pt-3"
    >
      <span class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">Filtres actifs</span>
      <span
        v-if="search.trim()"
        class="inline-flex items-center gap-1 rounded-lg border border-secondary-200 bg-secondary-50 px-2 py-1 text-xs font-medium text-secondary-700"
      >
        <Icon
          name="lucide:search"
          class="size-3"
        /> « {{ search }} »
        <button
          aria-label="Effacer"
          class="text-secondary-400 hover:text-red-600"
          @click="search = ''"
        ><Icon
          name="lucide:x"
          class="size-3"
        /></button>
      </span>
      <span
        v-for="c in chips"
        :key="c.key + ':' + c.value"
        class="inline-flex items-center gap-1 rounded-lg border border-primary-200/60 bg-primary-50/60 px-2 py-1 text-xs font-medium text-primary-700"
      >
        <span class="text-primary-400">{{ c.dim }}</span> {{ c.label }}
        <button
          aria-label="Retirer"
          class="text-primary-400 hover:text-red-600"
          @click="removeChip(c.key, c.value)"
        ><Icon
          name="lucide:x"
          class="size-3"
        /></button>
      </span>
      <UIButton
        variant="ghost"
        size="sm"
        class="ml-auto text-secondary-500 hover:bg-secondary-100 hover:text-secondary-800"
        @click="reset"
      >
        <Icon
          name="lucide:x"
          class="size-4"
        /> Tout effacer
      </UIButton>
    </div>
  </section>
</template>
