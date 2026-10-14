<script setup lang="ts">
import Pill from '~/components/ui/Pill.vue'
import { describeChange } from '~/utils/payloadDescribe'

type Change = { field: string, from: unknown, to: unknown }
type Audit = {
  id: string
  action: string
  createdAt: string
  userEmail?: string | null
  userName?: string | null
  diff?: { changes?: Change[] } | null
}

const props = defineProps<{ entite: string, history: Audit[] | null | undefined }>()

const meta: Record<string, { label: string, tone: string, icon: string, bg: string, fg: string }> = {
  create: { label: 'Création', tone: 'emerald', icon: 'lucide:plus', bg: 'bg-emerald-100', fg: 'text-emerald-600' },
  update: { label: 'Modification', tone: 'blue', icon: 'lucide:pencil', bg: 'bg-blue-100', fg: 'text-blue-600' },
  delete: { label: 'Suppression', tone: 'red', icon: 'lucide:trash-2', bg: 'bg-red-100', fg: 'text-red-600' },
  import: { label: 'Import', tone: 'amber', icon: 'lucide:upload', bg: 'bg-amber-100', fg: 'text-amber-600' },
}
const m = (a: string) => meta[a] ?? { label: a, tone: 'gray', icon: 'lucide:dot', bg: 'bg-secondary-100', fg: 'text-secondary-500' }
const fmtDate = (d: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(d))
const chg = (c: Change) => describeChange(props.entite, c.field, c.from, c.to)
</script>

<template>
  <div
    v-if="!history?.length"
    class="text-sm text-secondary-400"
  >
    Aucune modification enregistrée.
  </div>
  <ol
    v-else
    class="relative space-y-6 border-l-2 border-primary-200/50 pl-8"
  >
    <li
      v-for="h in history"
      :key="h.id"
      class="relative"
    >
      <span
        class="absolute -left-[calc(2rem+13px)] top-0 flex size-6 items-center justify-center rounded-full ring-4 ring-white"
        :class="m(h.action).bg"
      >
        <Icon
          :name="m(h.action).icon"
          class="size-3.5"
          :class="m(h.action).fg"
        />
      </span>
      <div class="rounded-xl border border-secondary-200/70 bg-white p-3.5 shadow-sm">
        <div class="flex flex-wrap items-center gap-2">
          <Pill :tone="m(h.action).tone">
            {{ m(h.action).label }}
          </Pill>
          <span class="text-sm font-medium text-secondary-800">{{ h.userName || h.userEmail || 'Système' }}</span>
          <span class="ml-auto shrink-0 font-mono text-xs text-secondary-400">{{ fmtDate(h.createdAt) }}</span>
        </div>
        <ul
          v-if="h.diff?.changes?.length"
          class="mt-2.5 space-y-1 border-t border-secondary-100 pt-2.5 font-mono text-xs"
        >
          <li
            v-for="(c, i) in h.diff.changes"
            :key="i"
            class="flex flex-wrap items-center gap-1.5"
          >
            <span class="text-secondary-500">{{ chg(c).label }}</span>
            <span class="rounded bg-secondary-50 px-1.5 py-0.5 text-secondary-400 line-through">{{ chg(c).from }}</span>
            <Icon
              name="lucide:arrow-right"
              class="size-3 text-secondary-300"
            />
            <span class="rounded bg-primary-50 px-1.5 py-0.5 font-medium text-primary-700">{{ chg(c).to }}</span>
          </li>
        </ul>
      </div>
    </li>
  </ol>
</template>
