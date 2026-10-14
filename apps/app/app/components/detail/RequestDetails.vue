<script setup lang="ts">
import { describePayload } from '~/utils/payloadDescribe'

type Change = { label: string, from: string, to: string }
const props = defineProps<{
  category: string
  action: string
  payload: Record<string, unknown> | null
  changes: Change[] | null
  loading: boolean
}>()

const rows = computed(() => describePayload(props.category, props.payload))
const isLong = (v: string) => v.length > 55

const mode = computed(() => {
  if (props.action === 'delete') return 'delete'
  if (props.action === 'update') {
    if (props.loading) return 'loading'
    if (props.changes && props.changes.length) return 'diff'
    if (props.changes) return 'nochange'
  }
  return 'values' // création, ou modification dont l'entité est introuvable
})
</script>

<template>
  <!-- Chargement de la fiche actuelle -->
  <div
    v-if="mode === 'loading'"
    class="mt-3 flex items-center gap-2 border-t border-secondary-100 pt-3 text-xs text-secondary-400"
  >
    <div class="size-2 animate-ping rounded-full bg-secondary-300" /> Chargement du détail…
  </div>

  <!-- Aucune différence -->
  <div
    v-else-if="mode === 'nochange'"
    class="mt-3 border-t border-secondary-100 pt-3 text-xs text-secondary-400"
  >
    Aucune modification par rapport à la fiche actuelle.
  </div>

  <!-- Suppression -->
  <div
    v-else-if="mode === 'delete'"
    class="mt-3 flex items-center gap-2 rounded-xl border border-red-200/70 bg-red-50/60 px-3 py-2.5 text-xs font-medium text-red-700"
  >
    <Icon
      name="lucide:triangle-alert"
      class="size-4 shrink-0"
    /> Cette fiche sera définitivement supprimée.
  </div>

  <!-- Modification : diff avant → après, en grille alignée -->
  <div
    v-else-if="mode === 'diff'"
    class="mt-3 rounded-xl border border-secondary-100 bg-secondary-50/50 p-3.5"
  >
    <div class="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">
      <Icon
        name="lucide:git-compare-arrows"
        class="size-3.5"
      /> Modifications
    </div>
    <dl class="grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2">
      <template
        v-for="(c, i) in changes"
        :key="i"
      >
        <dt class="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary-400">
          {{ c.label }}
        </dt>
        <dd class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          <span class="rounded bg-white px-1.5 py-0.5 text-secondary-400 line-through ring-1 ring-secondary-200/70">{{ c.from }}</span>
          <Icon
            name="lucide:arrow-right"
            class="size-3 shrink-0 text-secondary-300"
          />
          <span class="rounded bg-primary-50 px-1.5 py-0.5 font-semibold text-primary-700 ring-1 ring-primary-200/60">{{ c.to }}</span>
        </dd>
      </template>
    </dl>
  </div>

  <!-- Création (ou valeurs soumises) : grille de mini-champs alignés -->
  <div
    v-else-if="rows.length"
    class="mt-3 rounded-xl border border-secondary-100 bg-secondary-50/50 p-3.5"
  >
    <div class="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">
      <Icon
        name="lucide:list"
        class="size-3.5"
      /> {{ action === 'create' ? 'Nouvelle fiche' : 'Valeurs soumises' }}
    </div>
    <dl class="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
      <div
        v-for="d in rows"
        :key="d.label"
        class="min-w-0"
        :class="isLong(d.value) ? 'col-span-full' : ''"
      >
        <dt class="font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary-400">
          {{ d.label }}
        </dt>
        <dd
          class="mt-0.5 text-sm text-secondary-800"
          :class="isLong(d.value) ? 'leading-relaxed' : 'truncate'"
          :title="d.value"
        >
          {{ d.value }}
        </dd>
      </div>
    </dl>
  </div>
</template>
