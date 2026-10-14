<script setup lang="ts">
defineProps<{ title: string, icon?: string }>()
</script>

<template>
  <section class="relative rounded-2xl border border-primary-200/50 bg-background/40 p-6 shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div class="absolute -right-16 -top-16 size-40 rounded-full bg-primary-200/20 blur-3xl" />
    </div>
    <h2 class="relative mb-4 flex items-center gap-2 font-sans text-sm font-semibold tracking-tight text-primary-600">
      <Icon
        v-if="icon"
        :name="icon"
        class="size-4"
      /> {{ title }}
    </h2>
    <div class="relative space-y-2.5">
      <slot />
    </div>
  </section>
</template>
