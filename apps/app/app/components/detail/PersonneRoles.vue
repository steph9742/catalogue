<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

const props = defineProps<{ personneId: string }>()
type Role = { role: string, unitType: string, unitId: string, unitNom: string }
const api = useApi()
const { data: roles } = await useAsyncData(
  `roles-${props.personneId}`,
  () => api<Role[]>(`/api/personnes/${props.personneId}/roles`),
  { getCachedData: () => undefined },
)
</script>

<template>
  <DetailSection
    v-if="roles?.length"
    title="Responsabilités"
    icon="lucide:crown"
  >
    <div class="flex flex-wrap gap-2">
      <NuxtLink
        v-for="(r, i) in roles"
        :key="i"
        :to="`/${r.unitType}/${r.unitId}`"
        class="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 py-1 pl-2.5 pr-2.5 text-xs text-amber-900 shadow-sm transition-colors hover:border-amber-300"
      >
        <Icon
          name="lucide:crown"
          class="size-3.5 text-amber-500"
        />
        <span class="font-semibold text-amber-700">{{ r.role }}</span>
        <span class="text-amber-400">·</span> {{ r.unitNom }}
      </NuxtLink>
    </div>
  </DetailSection>
</template>
