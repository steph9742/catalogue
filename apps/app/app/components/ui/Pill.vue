<script setup lang="ts">
withDefaults(defineProps<{ tone?: string }>(), { tone: 'gray' })

const tones: Record<string, string> = {
  gray: 'bg-secondary-50 text-secondary-600 border-secondary-200/60',
  primary: 'bg-primary-50 text-primary-700 border-primary-200/60',
  red: 'bg-red-50 text-red-700 border-red-200/60',
  orange: 'bg-orange-50 text-orange-700 border-orange-200/60',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/60',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  blue: 'bg-blue-50 text-blue-700 border-blue-200/60',
  purple: 'bg-purple-50 text-purple-700 border-purple-200/60',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
    :class="tones[tone] ?? tones.gray"
  >
    <slot />
  </span>
</template>
