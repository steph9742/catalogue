<script setup lang="ts">
import { computed } from 'vue'
import { labelOfAutre } from '~/utils/catalogueEnums'
import { columnTone } from '~/utils/pillTones'
import type { CatalogueColumn, CatalogueConfig } from '~/utils/catalogues'
import Pill from '~/components/ui/Pill.vue'

// VUE TABLEAU — l'alternative aux cartes, pour ANALYSER plutôt que parcourir.

const props = defineProps<{
  config: CatalogueConfig
  lignes: Record<string, unknown>[]
  colonnes: string[] // clés visibles, dans l'ordre choisi
  triCle: string
  triSens: 'asc' | 'desc'
  selection: Set<string>
  selectionnable: boolean
  curseur: number
  titreDe: (row: Record<string, unknown>) => string
}>()
const emit = defineEmits<{
  trier: [cle: string]
  basculer: [id: string]
  basculerTout: []
}>()

const colonnesAffichees = computed(() =>
  props.colonnes
    .map(k => props.config.columns.find(c => c.key === k))
    .filter(Boolean) as CatalogueColumn[])

const valeur = (col: CatalogueColumn, row: Record<string, unknown>): string => {
  const v = row[col.key]
  if (col.options) return labelOfAutre(col.options, v as string, row[col.autreKey ?? ''] as string)
  if (col.bool) return v ? 'oui' : 'non'
  return v == null || v === '' ? '—' : String(v)
}

const toutCoche = computed(() =>
  props.lignes.length > 0 && props.lignes.every(r => props.selection.has(String(r.id))))
</script>

<template>
  <div class="overflow-x-auto rounded-2xl border border-secondary-200/60 bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
    <table class="w-full min-w-max text-sm">
      <thead class="border-b border-secondary-200/70 bg-secondary-50/60">
        <tr>
          <th
            v-if="selectionnable"
            class="w-10 px-3 py-2.5"
          >
            <input
              type="checkbox"
              class="size-4 rounded border-secondary-300 text-primary-600"
              :checked="toutCoche"
              aria-label="Tout sélectionner sur cette page"
              @change="emit('basculerTout')"
            >
          </th>
          <!-- Le nom reste la première colonne et n'est pas masquable : sans lui, une
               ligne n'est plus identifiable. -->
          <th class="px-3 py-2.5 text-left">
            <button
              class="inline-flex items-center gap-1 font-medium text-secondary-700 hover:text-primary-700"
              @click="emit('trier', '__title')"
            >
              Nom
              <Icon
                v-if="triCle === '__title'"
                :name="triSens === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'"
                class="size-3.5"
              />
            </button>
          </th>
          <th
            v-for="c in colonnesAffichees"
            :key="c.key"
            class="whitespace-nowrap px-3 py-2.5 text-left"
          >
            <button
              class="inline-flex items-center gap-1 font-medium text-secondary-700 hover:text-primary-700"
              @click="emit('trier', c.key)"
            >
              {{ c.label }}
              <Icon
                v-if="triCle === c.key"
                :name="triSens === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'"
                class="size-3.5"
              />
            </button>
          </th>
          <th class="w-10" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, i) in lignes"
          :key="String(row.id)"
          class="border-b border-secondary-100 last:border-0 transition-colors hover:bg-primary-50/40"
          :class="[
            selection.has(String(row.id)) ? 'bg-primary-50/60' : '',
            curseur === i ? 'ring-1 ring-inset ring-primary-400/40' : '',
          ]"
        >
          <td
            v-if="selectionnable"
            class="px-3 py-2"
          >
            <input
              type="checkbox"
              class="size-4 rounded border-secondary-300 text-primary-600"
              :checked="selection.has(String(row.id))"
              :aria-label="`Sélectionner ${titreDe(row)}`"
              @change="emit('basculer', String(row.id))"
            >
          </td>
          <td class="max-w-xs px-3 py-2">
            <NuxtLink
              :to="`/${config.key}/${row.id}`"
              class="block truncate font-medium text-secondary-900 hover:text-primary-700"
            >
              {{ titreDe(row) }}
            </NuxtLink>
          </td>
          <td
            v-for="c in colonnesAffichees"
            :key="c.key"
            class="whitespace-nowrap px-3 py-2"
          >
            <Pill
              v-if="c.options || c.bool"
              :tone="c.bool ? (row[c.key] ? 'emerald' : 'gray') : columnTone(config.key, c.key, row[c.key])"
            >
              {{ valeur(c, row) }}
            </Pill>
            <span
              v-else
              class="text-secondary-600"
            >{{ valeur(c, row) }}</span>
          </td>
          <td class="px-3 py-2 text-right">
            <NuxtLink
              :to="`/${config.key}/${row.id}`"
              class="text-secondary-300 transition-colors hover:text-primary-600"
              aria-label="Ouvrir"
            >
              <Icon
                name="lucide:chevron-right"
                class="size-4"
              />
            </NuxtLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
