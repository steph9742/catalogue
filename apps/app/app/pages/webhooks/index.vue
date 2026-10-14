<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'

const api = useApi()
const { data: hooks, pending } = await useAsyncData('webhooks', () =>
  api<Record<string, unknown>[]>('/api/webhooks'),
{ getCachedData: () => undefined })
const nbEvents = (h: Record<string, unknown>) => (Array.isArray(h.events) ? h.events.length : 0)
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Webhooks
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Envoi d'événements vers des flux externes (n8n…).
        </p>
      </div>
      <UIButton
        variant="primary"
        class="font-medium tracking-tight shadow-sm shadow-primary-500/20 transition-all duration-300 hover:shadow-md hover:shadow-primary-500/30"
        @click="navigateTo('/webhooks/new')"
      >
        <Icon
          name="lucide:plus"
          class="size-4"
        /> Nouveau
      </UIButton>
    </header>

    <section
      v-if="pending"
      class="flex items-center justify-center rounded-2xl border border-dashed border-primary-200/50 bg-primary-50/40 py-24"
    >
      <div class="flex items-center gap-3 font-mono text-sm text-primary-600">
        <div class="size-3 animate-ping rounded-full bg-primary-400" /> Chargement…
      </div>
    </section>
    <section
      v-else-if="!hooks?.length"
      class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
        <Icon
          name="lucide:webhook"
          class="size-7 text-primary-600"
        />
      </div>
      <p class="font-medium text-secondary-600">
        Aucun webhook.
      </p>
      <p class="mt-1 text-sm text-secondary-500">
        Cliquez sur « Nouveau » pour en créer un.
      </p>
    </section>

    <section
      v-else
      class="grid grid-cols-1 gap-3"
    >
      <NuxtLink
        v-for="h in hooks"
        :key="String(h.id)"
        :to="`/webhooks/${h.id}`"
        class="group relative block overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] sm:p-5"
      >
        <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div class="flex flex-col gap-3 pl-1 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <h3 class="truncate text-base font-medium tracking-tight text-secondary-900 group-hover:text-primary-900">{{ h.nom }}</h3>
            <p class="mt-1 truncate font-mono text-xs text-secondary-500">{{ h.url }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <Pill tone="gray">{{ nbEvents(h) }} événement{{ nbEvents(h) > 1 ? 's' : '' }}</Pill>
            <Pill :tone="h.actif ? 'emerald' : 'gray'">{{ h.actif ? 'Actif' : 'Inactif' }}</Pill>
          </div>
        </div>
      </NuxtLink>
    </section>
  </div>
</template>
