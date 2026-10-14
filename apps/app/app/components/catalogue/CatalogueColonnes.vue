<script setup lang="ts">
import { ref } from 'vue'

// CHOIX DES COLONNES du mode tableau : lesquelles afficher, et dans quel ordre.

defineProps<{
  possibles: { key: string, label: string }[]
  choisies: string[]
}>()
const emit = defineEmits<{ basculer: [cle: string], deplacer: [cle: string, sens: -1 | 1], reinitialiser: [] }>()

const ouvert = ref(false)
</script>

<template>
  <div class="relative">
    <button
      class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
      @click="ouvert = !ouvert"
    >
      <Icon
        name="lucide:columns-3"
        class="size-4"
      />
      Colonnes <span class="font-mono text-xs text-secondary-400">({{ choisies.length }})</span>
    </button>

    <div
      v-if="ouvert"
      class="fixed inset-0 z-40"
      @click="ouvert = false"
    />
    <div
      v-if="ouvert"
      class="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-secondary-200 bg-white p-3 shadow-xl"
    >
      <p class="mb-2 font-mono text-[10px] uppercase tracking-widest text-secondary-400">
        Colonnes affichées
      </p>

      <!-- D'abord les colonnes retenues, dans leur ordre : c'est ce qu'on veut régler. -->
      <ul class="mb-2 space-y-1">
        <li
          v-for="(cle, i) in choisies"
          :key="cle"
          class="flex items-center gap-1.5 rounded-lg bg-primary-50/60 px-2 py-1.5"
        >
          <input
            type="checkbox"
            checked
            class="size-3.5 rounded border-secondary-300 text-primary-600"
            @change="emit('basculer', cle)"
          >
          <span class="min-w-0 flex-1 truncate text-sm text-secondary-800">
            {{ possibles.find(p => p.key === cle)?.label ?? cle }}
          </span>
          <button
            class="text-secondary-400 hover:text-primary-600 disabled:opacity-25"
            :disabled="i === 0"
            aria-label="Monter"
            @click="emit('deplacer', cle, -1)"
          >
            <Icon
              name="lucide:chevron-up"
              class="size-4"
            />
          </button>
          <button
            class="text-secondary-400 hover:text-primary-600 disabled:opacity-25"
            :disabled="i === choisies.length - 1"
            aria-label="Descendre"
            @click="emit('deplacer', cle, 1)"
          >
            <Icon
              name="lucide:chevron-down"
              class="size-4"
            />
          </button>
        </li>
      </ul>

      <div class="max-h-56 overflow-y-auto border-t border-secondary-100 pt-2">
        <label
          v-for="p in possibles.filter(x => !choisies.includes(x.key))"
          :key="p.key"
          class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-secondary-600 hover:bg-secondary-50"
        >
          <input
            type="checkbox"
            class="size-3.5 rounded border-secondary-300 text-primary-600"
            @change="emit('basculer', p.key)"
          >
          <span class="truncate">{{ p.label }}</span>
        </label>
      </div>

      <button
        class="mt-2 w-full rounded-lg border border-secondary-200 py-1.5 text-xs text-secondary-600 transition-colors hover:bg-secondary-50"
        @click="emit('reinitialiser')"
      >
        Réinitialiser
      </button>
    </div>
  </div>
</template>
