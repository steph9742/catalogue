<script setup lang="ts">
import Pill from '~/components/ui/Pill.vue'
import { describeChange } from '~/utils/payloadDescribe'

type Change = { field: string, from: unknown, to: unknown }
type AuditRow = {
  id: string
  entite: string
  entiteId: string
  action: string
  diff?: { changes?: Change[] } | null
  createdAt: string
  userEmail: string | null
  userName: string | null
}

type Page = { rows: AuditRow[], total: number, page: number, pageSize: number }

const api = useApi()
const page = ref(1)
const TAILLE = 200

// La route rendait 200 lignes sans le dire et sans total : une réponse tronquée y était
// indiscernable d'un journal complet.
const { data: journal, error } = await useAsyncData(
  'audit',
  () => api<Page>(`/api/audit?page=${page.value}&pageSize=${TAILLE}`),
  { watch: [page], getCachedData: () => undefined },
)

const entries = computed(() => journal.value?.rows ?? [])
const total = computed(() => journal.value?.total ?? 0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / TAILLE)))

const meta: Record<string, { label: string, tone: string }> = {
  create: { label: 'Création', tone: 'emerald' },
  update: { label: 'Modification', tone: 'blue' },
  delete: { label: 'Suppression', tone: 'red' },
  import: { label: 'Import', tone: 'amber' },
}
const m = (a: string) => meta[a] ?? { label: a, tone: 'gray' }
const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const chg = (e: AuditRow, c: Change) => describeChange(e.entite, c.field, c.from, c.to)
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Journal d'audit
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        {{ total.toLocaleString('fr-FR') }} écriture{{ total > 1 ? 's' : '' }} enregistrée{{ total > 1 ? 's' : '' }} sur les catalogues.
        <template v-if="pages > 1">
          Page {{ journal?.page ?? 1 }} sur {{ pages }}.
        </template>
      </p>
    </header>

    <div
      v-if="error"
      class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      Accès réservé aux administrateurs.
    </div>
    <section
      v-else-if="!entries.length"
      class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
        <Icon
          name="lucide:scroll-text"
          class="size-7 text-primary-600"
        />
      </div>
      <p class="font-medium text-secondary-600">
        Aucune écriture enregistrée.
      </p>
    </section>

    <ul
      v-else
      class="space-y-2.5"
    >
      <li
        v-for="e in entries"
        :key="e.id"
        class="rounded-2xl border border-secondary-200/70 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
      >
        <div class="flex flex-wrap items-center gap-2">
          <Pill :tone="m(e.action).tone">
            {{ m(e.action).label }}
          </Pill>
          <span class="text-sm font-medium text-secondary-800">{{ e.userName || e.userEmail || 'Système' }}</span>
          <span class="text-sm text-secondary-500">·</span>
          <NuxtLink
            v-if="e.entiteId"
            :href="`/${e.entite}/${e.entiteId}`"
            class="text-sm font-medium text-primary-600 hover:underline"
          >{{ e.entite }}</NuxtLink>
          <span
            v-else
            class="text-sm text-secondary-600"
          >{{ e.entite }}</span>
          <span class="ml-auto shrink-0 font-mono text-xs text-secondary-400">{{ fmt(e.createdAt) }}</span>
        </div>
        <ul
          v-if="e.diff?.changes?.length"
          class="mt-2.5 space-y-1 border-t border-secondary-100 pt-2.5 font-mono text-xs"
        >
          <li
            v-for="(c, i) in e.diff.changes"
            :key="i"
            class="flex flex-wrap items-center gap-1.5"
          >
            <span class="text-secondary-500">{{ chg(e, c).label }}</span>
            <span class="rounded bg-secondary-50 px-1.5 py-0.5 text-secondary-400 line-through">{{ chg(e, c).from }}</span>
            <Icon
              name="lucide:arrow-right"
              class="size-3 text-secondary-300"
            />
            <span class="rounded bg-primary-50 px-1.5 py-0.5 font-medium text-primary-700">{{ chg(e, c).to }}</span>
          </li>
        </ul>
      </li>
    </ul>

    <!-- Sans ces boutons, les écritures au-delà de la première page seraient hors
         d'atteinte depuis l'interface — le plafond serait muet autrement. -->
    <nav
      v-if="pages > 1"
      class="flex items-center justify-between gap-3 pt-2"
    >
      <button
        type="button"
        class="rounded-lg border border-secondary-200 px-3 py-1.5 text-sm text-secondary-700 transition hover:bg-secondary-50 disabled:opacity-40"
        :disabled="page <= 1"
        @click="page = Math.max(1, page - 1)"
      >
        Page précédente
      </button>
      <span class="text-xs text-secondary-500">
        Écritures {{ ((journal?.page ?? 1) - 1) * TAILLE + 1 }} à
        {{ Math.min((journal?.page ?? 1) * TAILLE, total) }} sur {{ total.toLocaleString('fr-FR') }}
      </span>
      <button
        type="button"
        class="rounded-lg border border-secondary-200 px-3 py-1.5 text-sm text-secondary-700 transition hover:bg-secondary-50 disabled:opacity-40"
        :disabled="page >= pages"
        @click="page = Math.min(pages, page + 1)"
      >
        Page suivante
      </button>
    </nav>
  </div>
</template>
