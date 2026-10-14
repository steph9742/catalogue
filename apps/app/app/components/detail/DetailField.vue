<script setup lang="ts">
defineProps<{ label: string, value?: string | number | null, wide?: boolean }>()
</script>

<template>
  <!-- Champ large : libellé au-dessus, contenu pleine largeur (relations, chips, listes). -->
  <div
    v-if="wide"
    class="border-b border-primary-200/30 pb-2.5 last:border-0 last:pb-0"
  >
    <div class="mb-1.5 text-sm font-medium text-secondary-600">
      {{ label }}
    </div>
    <div class="text-sm text-secondary-900">
      <slot>
        <span v-if="value !== null && value !== undefined && value !== ''">{{ value }}</span>
        <span
          v-else
          class="text-secondary-300"
        >—</span>
      </slot>
    </div>
  </div>
  <!-- Champ simple : libellé à gauche, valeur mono à droite. -->
  <div
    v-else
    class="flex items-start justify-between gap-4 border-b border-primary-200/30 pb-2.5 last:border-0 last:pb-0"
  >
    <span class="shrink-0 text-sm font-medium text-secondary-600">{{ label }}</span>
    <span class="min-w-0 text-right font-mono text-sm tracking-tight text-secondary-900">
      <slot>
        <span v-if="value !== null && value !== undefined && value !== ''">{{ value }}</span>
        <span
          v-else
          class="text-secondary-300"
        >—</span>
      </slot>
    </span>
  </div>
</template>
