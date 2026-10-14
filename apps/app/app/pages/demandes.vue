<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
import { fieldsForCategory, describeChange } from '~/utils/payloadDescribe'
import RequestDetails from '~/components/detail/RequestDetails.vue'
import { catalogues } from '~/utils/catalogues'

type Req = {
  id: string
  category: string
  action: 'create' | 'update' | 'delete'
  entityId: string | null
  payload: Record<string, unknown> | null
  status: string
  createdAt: string
  requesterEmail?: string | null
}

const api = useApi()
const perms = await usePermissions()
const isManager = perms.isManager
const badges = useBadges()

const { data: mine, refresh: refreshMine } = await useAsyncData('cr-mine', () =>
  api<Req[]>('/api/change-requests/mine'),
{ getCachedData: () => undefined })
const { data: toReview, refresh: refreshReview } = await useAsyncData('cr-review', () =>
  api<Req[]>('/api/change-requests'),
{ getCachedData: () => undefined })

const actionMeta: Record<string, { label: string, tone: string }> = {
  create: { label: 'Création', tone: 'emerald' },
  update: { label: 'Modification', tone: 'blue' },
  delete: { label: 'Suppression', tone: 'red' },
}
const actionSquare: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-600 border-emerald-200/70',
  update: 'bg-blue-50 text-blue-600 border-blue-200/70',
  delete: 'bg-red-50 text-red-600 border-red-200/70',
}
const statusMeta: Record<string, { label: string, tone: string }> = {
  pending: { label: 'En attente', tone: 'amber' },
  approved: { label: 'Approuvée', tone: 'emerald' },
  rejected: { label: 'Rejetée', tone: 'red' },
}
const am = (a: string) => actionMeta[a] ?? { label: a, tone: 'gray' }
const catMeta = (cat: string) => {
  const c = catalogues[cat]
  if (c) return { label: c.label, icon: c.icon }
  return ({
    applications: { label: 'Applications', icon: 'lucide:app-window' },
    postes: { label: 'Logiciels postes de travail', icon: 'lucide:monitor-smartphone' },
  } as Record<string, { label: string, icon: string }>)[cat] ?? { label: cat, icon: 'lucide:folder' }
}
const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
  }
  catch { return s }
}

// Chargement de l'entité actuelle (pour un diff avant→après sur les modifications/suppressions).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const entities = reactive<Record<string, any>>({})
const loadingEnt = reactive<Record<string, boolean>>({})
const endpointFor = (cat: string) => catalogues[cat]?.endpoint ?? cat
const entKey = (r: Req) => `${r.category}:${r.entityId}`
const entReady = (r: Req) => r.action === 'create' || entKey(r) in entities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const naturalOf = (o: any) => o?.nom ?? o?.hostname ?? o?.identifiant ?? o?.email ?? ''
const summary = (r: Req) => String(naturalOf(r.payload) || naturalOf(entities[entKey(r)]) || r.entityId || '')

async function ensureEntity(r: Req) {
  if (!r.entityId || r.action === 'create') return
  const k = entKey(r)
  if (k in entities || loadingEnt[k]) return
  loadingEnt[k] = true
  try {
    entities[k] = await api(`/api/${endpointFor(r.category)}/${r.entityId}`)
  }
  catch { entities[k] = null }
  finally { loadingEnt[k] = false }
}
watch([toReview, mine], () => {
  for (const r of [...(toReview.value ?? []), ...(mine.value ?? [])]) if (r.action !== 'create') void ensureEntity(r)
}, { immediate: true })

const norm = (v: unknown) => Array.isArray(v) ? [...v].map(String).sort().join('|') : (v == null ? '' : String(v))
type Change = { label: string, from: string, to: string }
// null = entité pas encore chargée (ou introuvable) ; [] = aucune modification détectée.
function changesFor(r: Req): Change[] | null {
  const ent = entities[entKey(r)]
  if (!ent || !r.payload) return null
  const out: Change[] = []
  for (const f of fieldsForCategory(r.category)) {
    if (!(f.key in r.payload)) continue
    const from = ent[f.key]
    const to = r.payload[f.key]
    if (norm(from) === norm(to)) continue
    out.push(describeChange(r.category, f.key, from, to))
  }
  return out
}

const busy = ref('')
const errorMsg = ref('')
const decide = async (id: string, verb: 'approve' | 'reject') => {
  busy.value = id
  errorMsg.value = ''
  try {
    await api(`/api/change-requests/${id}/${verb}`, { method: 'POST', body: verb === 'reject' ? {} : undefined })
    await Promise.all([refreshReview(), refreshMine()])
    await badges.refresh()
  }
  catch (e: unknown) {
    const data = (e as { data?: unknown })?.data
    errorMsg.value = typeof data === 'string' ? data : 'Échec de l\'opération.'
  }
  finally { busy.value = '' }
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 p-6 animate-in fade-in duration-500">
    <header class="relative overflow-hidden rounded-2xl border border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40 p-6 shadow-sm">
      <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div class="absolute -right-12 -top-16 size-52 rounded-full bg-primary-300/20 blur-3xl" />
      </div>
      <div class="relative flex items-center gap-3">
        <div class="flex size-11 items-center justify-center rounded-2xl border border-primary-200/60 bg-white text-primary-600 shadow-sm">
          <Icon
            name="lucide:inbox"
            class="size-6"
          />
        </div>
        <div>
          <UITitle class="tracking-tight text-secondary-900">
            Demandes
          </UITitle>
          <p class="mt-0.5 text-sm text-secondary-600/90">
            Validation des contributions et suivi de vos demandes.
          </p>
        </div>
      </div>
    </header>
    <p
      v-if="errorMsg"
      class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMsg }}
    </p>

    <!-- À valider (gestionnaires/admins) -->
    <section
      v-if="isManager"
      class="space-y-3"
    >
      <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">
        À valider
        <span
          v-if="toReview?.length"
          class="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700"
        >{{ toReview.length }}</span>
      </h2>
      <div
        v-if="!toReview?.length"
        class="rounded-2xl border border-secondary-200/50 bg-secondary-50/30 py-20 text-center shadow-sm"
      >
        <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
          <Icon
            name="lucide:check-check"
            class="size-7 text-primary-600"
          />
        </div>
        <p class="flex flex-col gap-1 font-medium text-secondary-600">
          <span>Aucune demande en attente.</span>
          <span class="text-sm font-normal opacity-80">Les contributions à valider apparaîtront ici.</span>
        </p>
      </div>
      <ul
        v-else
        class="space-y-2.5"
      >
        <li
          v-for="r in toReview"
          :key="r.id"
          class="group relative overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300/70 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)]"
        >
          <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div class="flex items-start gap-3.5 pl-1">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-sm"
              :class="actionSquare[r.action] ?? 'bg-secondary-50 text-secondary-500 border-secondary-200/70'"
            >
              <Icon
                :name="catMeta(r.category).icon"
                class="size-5"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <Pill :tone="am(r.action).tone">
                  {{ am(r.action).label }}
                </Pill>
                <span class="font-medium text-secondary-900">{{ catMeta(r.category).label }}</span>
                <span
                  v-if="summary(r)"
                  class="truncate text-sm text-secondary-600"
                >· {{ summary(r) }}</span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-secondary-500">
                <span class="inline-flex items-center gap-1"><Icon
                  name="lucide:user-round"
                  class="size-3.5"
                /> {{ r.requesterEmail ?? '—' }}</span>
                <span class="inline-flex items-center gap-1"><Icon
                  name="lucide:clock"
                  class="size-3.5"
                /> {{ fmtDate(r.createdAt) }}</span>
              </div>
            </div>
          </div>
          <RequestDetails
            :category="r.category"
            :action="r.action"
            :payload="r.payload"
            :changes="changesFor(r)"
            :loading="!entReady(r)"
          />
          <div class="mt-3 flex items-center justify-end gap-2 border-t border-secondary-100 pt-3">
            <UIButton
              size="md"
              variant="outline"
              class="group shadow-sm transition-all duration-300 hover:shadow-md"
              :disabled="busy === r.id"
              @click="decide(r.id, 'reject')"
            >
              <Icon
                name="lucide:x"
                class="text-base transition-transform group-hover:scale-110"
              />
              <span class="ml-1.5 font-medium tracking-tight">Rejeter</span>
            </UIButton>
            <UIButton
              size="md"
              variant="primary"
              class="group shadow-sm transition-all duration-300 hover:shadow-md"
              :disabled="busy === r.id"
              @click="decide(r.id, 'approve')"
            >
              <Icon
                name="lucide:check"
                class="text-base transition-transform group-hover:scale-110"
              />
              <span class="ml-1.5 font-medium tracking-tight">Approuver</span>
            </UIButton>
          </div>
        </li>
      </ul>
    </section>

    <!-- Mes demandes (tout le monde) -->
    <section class="space-y-3">
      <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">
        Mes demandes
        <span
          v-if="mine?.length"
          class="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary-100 px-1.5 text-[11px] font-bold text-secondary-600"
        >{{ mine.length }}</span>
      </h2>
      <div
        v-if="!mine?.length"
        class="rounded-2xl border border-secondary-200/50 bg-secondary-50/30 py-20 text-center shadow-sm"
      >
        <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
          <Icon
            name="lucide:file-clock"
            class="size-7 text-primary-600"
          />
        </div>
        <p class="flex flex-col gap-1 font-medium text-secondary-600">
          <span>Vous n'avez aucune demande.</span>
          <span class="text-sm font-normal opacity-80">Vos propositions de modification s'afficheront ici.</span>
        </p>
      </div>
      <ul
        v-else
        class="space-y-2.5"
      >
        <li
          v-for="r in mine"
          :key="r.id"
          class="group relative overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300/70"
        >
          <div class="flex items-start gap-3.5">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-sm"
              :class="actionSquare[r.action] ?? 'bg-secondary-50 text-secondary-500 border-secondary-200/70'"
            >
              <Icon
                :name="catMeta(r.category).icon"
                class="size-5"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <Pill :tone="statusMeta[r.status]?.tone ?? 'gray'">
                  {{ statusMeta[r.status]?.label ?? r.status }}
                </Pill>
                <Pill :tone="am(r.action).tone">
                  {{ am(r.action).label }}
                </Pill>
                <span class="font-medium text-secondary-900">{{ catMeta(r.category).label }}</span>
                <span
                  v-if="summary(r)"
                  class="truncate text-sm text-secondary-600"
                >· {{ summary(r) }}</span>
              </div>
              <div class="mt-1 text-xs text-secondary-500">
                <span class="inline-flex items-center gap-1"><Icon
                  name="lucide:clock"
                  class="size-3.5"
                /> {{ fmtDate(r.createdAt) }}</span>
              </div>
            </div>
          </div>
          <RequestDetails
            :category="r.category"
            :action="r.action"
            :payload="r.payload"
            :changes="changesFor(r)"
            :loading="!entReady(r)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
