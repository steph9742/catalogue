<script setup lang="ts">
// eslint-disable-next-line @typescript-eslint/no-explicit-any
defineProps<{ persons: any[] }>()
const fullName = (p: { nom: string, prenom: string | null }) => `${p.prenom ? p.prenom + ' ' : ''}${p.nom}`.trim()
</script>

<template>
  <div
    v-if="persons.length"
    class="flex flex-wrap gap-1.5 py-1"
  >
    <NuxtLink
      v-for="p in persons"
      :key="p.id"
      :to="`/personnes/${p.id}`"
      :title="p.fonction || ''"
      class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200 bg-white px-2 py-1 text-xs text-secondary-700 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-800"
    >
      <Icon
        name="lucide:user-round"
        class="size-3 text-secondary-400"
      /> {{ fullName(p) }}
    </NuxtLink>
  </div>
  <div
    v-else
    class="py-1 text-xs text-secondary-400"
  >
    Aucune personne rattachée.
  </div>
</template>
