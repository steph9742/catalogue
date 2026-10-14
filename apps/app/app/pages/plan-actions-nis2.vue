<script setup lang="ts">
import { nis2ActionStatuts, nis2ActionPriorites, nis2Domaines, labelOf } from '~/utils/catalogueEnums'

// Pilotage du plan d'actions NIS 2 : ce qui reste à faire, ce qui est fait, et ce qui dérape.

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('actions-nis2')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
// computed, et pas un booléen figé : les droits dépendent de `me`, qui se résout après
// l'hydratation — un snapshot au setup laisserait les boutons désactivés pour toujours.
const editable = computed(() => perms.canWrite('actions-nis2'))

type Statut = 'a_faire' | 'en_cours' | 'fait' | 'abandonnee'
type Action = {
  id: string
  exigenceNis2Id: string
  intitule: string
  statut: Statut
  priorite: string
  echeance: string | null
  dateFait: string | null
  responsable: string | null
  technicien: string | null
  reference: string
  exigence: string
  objectifNumero: number | null
  objectif: string | null
  domaine: string | null
}
type Avancement = {
  exigences: { total: number, fait: number, partiellement: number, tresPartiellement: number, pasDuTout: number, nonEvaluees: number, nonApplicables: number }
  actions: { total: number, aFaire: number, enCours: number, fait: number, abandonnee: number, enRetard: number }
}

const { data: actions, refresh } = await useAsyncData('plan-nis2', () => api<Action[]>('/api/plan-actions-nis2'), { getCachedData: () => undefined })
const { data: avancement, refresh: refreshKpi } = await useAsyncData('plan-nis2-kpi', () => api<Avancement>('/api/nis2/avancement'), { getCachedData: () => undefined })

// Date de PARIS (en-CA = format AAAA-MM-JJ), identique au serveur et au client : `toISOString`
// donnait la date UTC, fausse entre minuit et 2 h et source de divergence d'hydratation sur les
// échéances marquées en retard.
const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const enRetard = (a: Action) => !!a.echeance && a.echeance < aujourdhui && (a.statut === 'a_faire' || a.statut === 'en_cours')

// --- Filtres ------------------------------------------------------------------------
const fStatut = ref<'' | Statut | 'retard'>('')
const fDomaine = ref('')
const fResponsable = ref('')
const recherche = ref('')

const responsables = computed(() =>
  [...new Set((actions.value ?? []).flatMap(a => [a.responsable, a.technicien]).filter(Boolean) as string[])].sort())

const filtrees = computed(() => {
  const q = recherche.value.trim().toLowerCase()
  return (actions.value ?? []).filter((a) => {
    if (fStatut.value === 'retard' ? !enRetard(a) : fStatut.value && a.statut !== fStatut.value) return false
    if (fDomaine.value && a.domaine !== fDomaine.value) return false
    if (fResponsable.value && a.responsable !== fResponsable.value && a.technicien !== fResponsable.value) return false
    if (q && ![a.intitule, a.reference, a.exigence, a.objectif, a.responsable, a.technicien].join(' ').toLowerCase().includes(q)) return false
    return true
  })
})

// Regroupement par objectif de sécurité : c'est la maille du référentiel ReCyF.
const groupes = computed(() => {
  const m = new Map<string, { titre: string, domaine: string | null, items: Action[] }>()
  for (const a of filtrees.value) {
    const cle = a.objectifNumero ? `${a.objectifNumero}` : 'zz'
    const titre = a.objectifNumero ? `Objectif ${a.objectifNumero} — ${a.objectif}` : 'Hors objectif'
    const e = m.get(cle) ?? { titre, domaine: a.domaine, items: [] }
    e.items.push(a)
    m.set(cle, e)
  }
  return [...m.entries()]
    .sort((x, y) => (x[0] === 'zz' ? 1 : y[0] === 'zz' ? -1 : Number(x[0]) - Number(y[0])))
    .map(([, v]) => v)
})

// --- Bascule ------------------------------------------------------------------------
const TONE: Record<string, string> = {
  a_faire: 'border-secondary-200 bg-secondary-50 text-secondary-600',
  en_cours: 'border-amber-200 bg-amber-50 text-amber-700',
  fait: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  abandonnee: 'border-secondary-200 bg-secondary-50 text-secondary-400',
}
const ICONE: Record<string, string> = {
  a_faire: 'lucide:circle', en_cours: 'lucide:loader-circle', fait: 'lucide:check-circle-2', abandonnee: 'lucide:circle-slash',
}
const TONE_PRIORITE: Record<string, string> = {
  basse: 'text-secondary-400', moyenne: 'text-blue-600', haute: 'text-orange-600', critique: 'text-red-600',
}
const SUIVANT: Record<Statut, Statut> = { a_faire: 'en_cours', en_cours: 'fait', fait: 'a_faire', abandonnee: 'a_faire' }

const busy = ref('')
const basculer = async (a: Action, statut?: Statut) => {
  if (!editable.value || busy.value) return
  busy.value = a.id
  try {
    await api(`/api/actions-nis2/${a.id}/statut`, { method: 'PATCH', body: { statut: statut ?? SUIVANT[a.statut] } })
    await Promise.all([refresh(), refreshKpi()])
  }
  finally { busy.value = '' }
}

const kpi = computed(() => avancement.value?.actions)
const exi = computed(() => avancement.value?.exigences)
// Taux de conformité : les non applicables sortent du dénominateur.
const tauxConformite = computed(() => {
  const e = exi.value
  if (!e) return 0
  const base = e.total - e.nonApplicables
  return base ? Math.round((e.fait / base) * 100) : 0
})

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Plan d'actions NIS 2
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Référentiel ReCyF — {{ filtrees.length }} action(s) affichée(s)<span v-if="exi"> · {{ tauxConformite }}% des exigences applicables déclarées conformes</span>.
        </p>
      </div>
      <NuxtLink
        to="/exigences-nis2"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
      >
        <Icon
          name="lucide:clipboard-check"
          class="size-4"
        /> Exigences
      </NuxtLink>
    </header>

    <section
      v-if="kpi"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      <button
        v-for="t in [
          { k: '', label: 'Total', n: kpi.total, icon: 'lucide:list-todo' },
          { k: 'a_faire', label: 'À faire', n: kpi.aFaire, icon: 'lucide:circle' },
          { k: 'en_cours', label: 'En cours', n: kpi.enCours, icon: 'lucide:loader-circle' },
          { k: 'fait', label: 'Faites', n: kpi.fait, icon: 'lucide:check-circle-2' },
          { k: 'retard', label: 'En retard', n: kpi.enRetard, icon: 'lucide:alarm-clock' },
        ]"
        :key="t.label"
        :class="[TUILE, 'flex items-center gap-3 text-left transition-colors hover:bg-secondary-50/60', fStatut === t.k ? 'ring-2 ring-primary-500/30' : '']"
        @click="fStatut = fStatut === t.k ? '' : t.k as typeof fStatut"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-primary-50">
          <Icon
            :name="t.icon"
            class="size-4"
            :class="t.k === 'retard' && t.n ? 'text-red-600' : 'text-primary-600'"
          />
        </span>
        <span>
          <span
            class="block text-xl font-semibold leading-none tracking-tight"
            :class="t.k === 'retard' && t.n ? 'text-red-600' : 'text-secondary-900'"
          >{{ t.n }}</span>
          <span class="mt-1 block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
        </span>
      </button>
    </section>

    <section class="flex flex-wrap items-center gap-2">
      <input
        v-model="recherche"
        placeholder="Rechercher une action, une exigence…"
        :class="[CHAMP, 'min-w-[14rem] flex-1']"
      >
      <select
        v-model="fDomaine"
        :class="CHAMP"
      >
        <option value="">
          Tous les domaines
        </option>
        <option
          v-for="d in nis2Domaines"
          :key="d.value"
          :value="d.value"
        >
          {{ d.label }}
        </option>
      </select>
      <select
        v-model="fResponsable"
        :class="CHAMP"
      >
        <option value="">
          Toutes les personnes
        </option>
        <option
          v-for="r in responsables"
          :key="r"
          :value="r"
        >
          {{ r }}
        </option>
      </select>
      <select
        v-model="fStatut"
        :class="CHAMP"
      >
        <option value="">
          Tous les statuts
        </option>
        <option
          v-for="s in nis2ActionStatuts"
          :key="s.value"
          :value="s.value"
        >
          {{ s.label }}
        </option>
        <option value="retard">
          En retard
        </option>
      </select>
    </section>

    <section
      v-if="!actions?.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucune action au plan. Ouvrez une <NuxtLink
        to="/exigences-nis2"
        class="text-primary-600 hover:underline"
      >exigence NIS 2</NuxtLink> et ajoutez-y les actions à mener.
    </section>
    <section
      v-else-if="!filtrees.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucune action ne correspond aux filtres.
    </section>

    <section
      v-for="g in groupes"
      :key="g.titre"
      :class="[TUILE, 'space-y-1']"
    >
      <h2 class="mb-3 flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          name="lucide:scale"
          class="size-4 text-primary-500"
        />{{ g.titre }}
        <span
          v-if="g.domaine"
          class="inline-flex items-center rounded border border-primary-200/60 bg-primary-50/60 px-1.5 py-0.5 text-[10px] font-medium text-primary-700"
        >{{ labelOf(nis2Domaines, g.domaine) }}</span>
        <span class="ml-auto font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">{{ g.items.length }}</span>
      </h2>

      <div
        v-for="a in g.items"
        :key="a.id"
        class="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary-50"
      >
        <button
          :disabled="!editable || busy === a.id"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-default"
          :class="[TONE[a.statut], editable ? 'hover:brightness-95' : '']"
          :title="editable ? 'Cliquer pour faire avancer le statut' : ''"
          @click="basculer(a)"
        >
          <Icon
            :name="ICONE[a.statut]!"
            class="size-3.5"
          />{{ labelOf(nis2ActionStatuts, a.statut) }}
        </button>

        <NuxtLink
          :to="`/exigences-nis2/${a.exigenceNis2Id}`"
          class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-secondary-400 hover:text-primary-600"
          :title="a.exigence"
        >{{ a.reference }}</NuxtLink>

        <NuxtLink
          :to="`/actions-nis2/${a.id}`"
          class="text-sm hover:underline"
          :class="a.statut === 'fait' || a.statut === 'abandonnee' ? 'text-secondary-400 line-through' : 'text-secondary-800'"
        >{{ a.intitule }}</NuxtLink>

        <Icon
          v-if="a.priorite && a.priorite !== 'moyenne'"
          name="lucide:flag"
          class="size-3"
          :class="TONE_PRIORITE[a.priorite]"
          :title="`Priorité ${labelOf(nis2ActionPriorites, a.priorite)}`"
        />

        <span
          v-if="a.responsable || a.technicien"
          class="font-mono text-[10px] uppercase tracking-wide text-secondary-400"
        >
          {{ [a.responsable, a.technicien].filter(Boolean).join(' · ') }}
        </span>

        <span class="ml-auto shrink-0">
          <span
            v-if="a.dateFait"
            class="font-mono text-[10px] text-emerald-600"
          >fait le {{ a.dateFait }}</span>
          <span
            v-else-if="a.echeance"
            class="font-mono text-[10px]"
            :class="enRetard(a) ? 'font-semibold text-red-600' : 'text-secondary-400'"
          >
            {{ enRetard(a) ? 'en retard — ' : '' }}{{ a.echeance }}
          </span>
        </span>
      </div>
    </section>

    <p
      v-if="editable && actions?.length"
      class="text-center text-xs text-secondary-400"
    >
      Cliquez sur une pastille de statut pour la faire avancer : à faire → en cours → fait. La date de réalisation est posée automatiquement.
    </p>
  </div>
</template>
