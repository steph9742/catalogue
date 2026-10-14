<script setup lang="ts">
defineProps<{ n: number, title: string, tint?: boolean }>()
</script>

<template>
  <div>
    <div
      v-if="n > 1"
      class="h-px w-full bg-linear-to-r from-transparent via-secondary-300 to-transparent opacity-60"
    />
    <section
      class="relative overflow-hidden p-6 sm:p-8"
      :class="tint ? 'bg-secondary-50/40' : ''"
    >
      <div class="pointer-events-none absolute -right-10 -top-10 size-52 rounded-bl-full bg-primary-100/25 blur-3xl" />
      <div class="relative z-10 mb-6 flex items-center gap-3">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary-200 bg-primary-50 font-mono text-xs font-bold text-primary-700 shadow-sm">
          {{ String(n).padStart(2, '0') }}
        </div>
        <h2 class="font-sans text-lg font-medium tracking-tight text-secondary-950">
          {{ title }}
        </h2>
      </div>
      <div class="relative z-10">
        <slot />
      </div>
    </section>
  </div>
</template>
