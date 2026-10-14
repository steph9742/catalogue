<script setup lang="ts">
import { computed } from 'vue'
import { eventEntities, eventActions, echeanceTypes, echeanceCategory } from '~/utils/events'

// allowed = null/undefined → toutes les catégories (admin) ; sinon on limite le
// sélecteur aux catégories autorisées (gestionnaire sur ses catégories).
const props = defineProps<{ modelValue: string[], allowed?: string[] | null }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const entities = computed(() =>
  props.allowed ? eventEntities.filter(e => props.allowed!.includes(e.key)) : eventEntities,
)
const echeances = computed(() =>
  props.allowed ? echeanceTypes.filter(t => props.allowed!.includes(echeanceCategory[t.key] ?? '')) : echeanceTypes,
)

const selected = computed(() => new Set(props.modelValue ?? []))
const has = (k: string) => selected.value.has(k)

const toggle = (k: string) => {
  const s = new Set(props.modelValue ?? [])
  if (s.has(k)) s.delete(k)
  else s.add(k)
  emit('update:modelValue', [...s])
}

const toggleColumn = (action: string) => {
  const keys = entities.value.map(e => `${e.key}:${action}`)
  const s = new Set(props.modelValue ?? [])
  const allOn = keys.every(k => s.has(k))
  keys.forEach(k => (allOn ? s.delete(k) : s.add(k)))
  emit('update:modelValue', [...s])
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <div class="mb-2 text-xs font-medium uppercase tracking-wide text-secondary-400">
        Événements sur les catalogues
      </div>
      <div class="overflow-x-auto rounded-xl border border-secondary-200">
        <table class="w-full text-sm">
          <thead class="bg-secondary-50 text-secondary-600">
            <tr>
              <th class="px-3 py-2 text-left font-medium">
                Catalogue
              </th>
              <th
                v-for="a in eventActions"
                :key="a.key"
                class="px-3 py-2 text-center font-medium"
              >
                <button
                  type="button"
                  class="hover:text-primary-600"
                  @click="toggleColumn(a.key)"
                >
                  {{ a.label }}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in entities"
              :key="e.key"
              class="border-t border-secondary-100"
            >
              <td class="px-3 py-1.5 text-secondary-700">
                {{ e.label }}
              </td>
              <td
                v-for="a in eventActions"
                :key="a.key"
                class="px-3 py-1.5 text-center"
              >
                <input
                  type="checkbox"
                  class="size-4"
                  :checked="has(`${e.key}:${a.key}`)"
                  @change="toggle(`${e.key}:${a.key}`)"
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <div class="mb-2 text-xs font-medium uppercase tracking-wide text-secondary-400">
        Échéances
      </div>
      <div class="flex flex-wrap gap-3">
        <label
          v-for="t in echeances"
          :key="t.key"
          class="flex items-center gap-2 rounded-lg border border-secondary-200 px-3 py-1.5 text-sm"
        >
          <input
            type="checkbox"
            class="size-4"
            :checked="has(`echeance:${t.key}`)"
            @change="toggle(`echeance:${t.key}`)"
          >
          {{ t.label }}
        </label>
      </div>
    </div>

    <div>
      <div class="mb-2 text-xs font-medium uppercase tracking-wide text-secondary-400">
        Demandes à valider
      </div>
      <div class="flex flex-wrap gap-3">
        <label
          v-for="e in entities"
          :key="e.key"
          class="flex items-center gap-2 rounded-lg border border-secondary-200 px-3 py-1.5 text-sm"
        >
          <input
            type="checkbox"
            class="size-4"
            :checked="has(`demande:${e.key}`)"
            @change="toggle(`demande:${e.key}`)"
          >
          {{ e.label }}
        </label>
      </div>
    </div>
  </div>
</template>
