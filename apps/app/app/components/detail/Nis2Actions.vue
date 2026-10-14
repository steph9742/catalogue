<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'
import { nis2ActionStatuts, nis2ActionPriorites, labelOf } from '~/utils/catalogueEnums'

// Plan d'actions d'une exigence NIS 2. L'exigence dit « où on en est », les actions
// disent « ce qu'il reste à faire » : ajout en une ligne, bascule du statut en un clic.
const props = defineProps<{ exigenceId: string, editable: boolean }>()

type Action = {
  id: string
  intitule: string
  description: string | null
  statut: 'a_faire' | 'en_cours' | 'fait' | 'abandonnee'
  priorite: string
  echeance: string | null
  dateFait: string | null
  responsable: string | null
  technicien: string | null
}
type Personne = { id: string, nom: string, prenom: string | null }

const api = useApi()
const { data: actions, refresh } = await useAsyncData(
  `nis2-actions-${props.exigenceId}`,
  () => api<Action[]>(`/api/exigences-nis2/${props.exigenceId}/actions`),
  { getCachedData: () => undefined },
)
const { data: personnes } = await useAsyncData(
  'nis2-actions-personnes',
  () => api<Personne[]>('/api/personnes'),
  { getCachedData: () => undefined },
)
const optionsPersonnes = computed(() =>
  (personnes.value ?? [])
    .map(p => ({ id: p.id, label: `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim() }))
    .sort((a, b) => a.label.localeCompare(b.label)))

const ORDRE: Action['statut'][] = ['a_faire', 'en_cours', 'fait', 'abandonnee']
const TONE: Record<string, string> = {
  a_faire: 'border-secondary-200 bg-secondary-50 text-secondary-600',
  en_cours: 'border-amber-200 bg-amber-50 text-amber-700',
  fait: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  abandonnee: 'border-secondary-200 bg-secondary-50 text-secondary-400',
}
const TONE_PRIORITE: Record<string, string> = {
  basse: 'text-secondary-400',
  moyenne: 'text-blue-600',
  haute: 'text-orange-600',
  critique: 'text-red-600',
}

// Date de PARIS (en-CA = format AAAA-MM-JJ), identique au serveur et au client : `toISOString`
// donnait la date UTC, fausse entre minuit et 2 h et source de divergence d'hydratation sur les
// échéances marquées en retard.
const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const enRetard = (a: Action) => !!a.echeance && a.echeance < aujourdhui && (a.statut === 'a_faire' || a.statut === 'en_cours')

// Avancement : les actions abandonnées ne comptent pas au dénominateur.
const avancement = computed(() => {
  const actives = (actions.value ?? []).filter(a => a.statut !== 'abandonnee')
  const faites = actives.filter(a => a.statut === 'fait').length
  return { faites, total: actives.length, pct: actives.length ? Math.round((faites / actives.length) * 100) : 0 }
})

const busy = ref('')
// Cycle « à faire → en cours → fait → à faire » : un clic suffit pour avancer.
const SUIVANT: Record<Action['statut'], Action['statut']> = {
  a_faire: 'en_cours', en_cours: 'fait', fait: 'a_faire', abandonnee: 'a_faire',
}
const basculer = async (a: Action, statut?: Action['statut']) => {
  if (busy.value) return
  busy.value = a.id
  try {
    await api(`/api/actions-nis2/${a.id}/statut`, { method: 'PATCH', body: { statut: statut ?? SUIVANT[a.statut] } })
    await refresh()
  }
  finally { busy.value = '' }
}

const VIDE = { intitule: '', description: '', priorite: 'moyenne', echeance: '', responsableId: '', technicienId: '' }
const form = reactive({ ...VIDE })
const ajout = ref(false)
const ajouter = async () => {
  if (!form.intitule.trim() || ajout.value) return
  ajout.value = true
  try {
    await api(`/api/exigences-nis2/${props.exigenceId}/actions`, {
      method: 'POST',
      body: { ...form, intitule: form.intitule.trim(), description: form.description.trim() || undefined },
    })
    Object.assign(form, VIDE)
    await refresh()
  }
  finally { ajout.value = false }
}

// Description : consultable au dépliage, et modifiable sur place sans ouvrir la fiche.
const deplie = ref('')
const brouillon = ref('')
const basculerDetail = (a: Action) => {
  deplie.value = deplie.value === a.id ? '' : a.id
  brouillon.value = a.description ?? ''
}
const enregistrerDescription = async (a: Action) => {
  await api(`/api/actions-nis2/${a.id}`, { method: 'PATCH', body: { description: brouillon.value.trim() || null } })
  deplie.value = ''
  await refresh()
}
const supprimer = async (id: string) => {
  await api(`/api/actions-nis2/${id}`, { method: 'DELETE' })
  await refresh()
}

const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const LIBELLE = 'font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <DetailSection
    title="Plan d'actions"
    icon="lucide:list-todo"
  >
    <div
      v-if="avancement.total"
      class="flex items-center gap-3"
    >
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary-100">
        <div
          class="h-full rounded-full bg-emerald-500 transition-all duration-500"
          :style="{ width: avancement.pct + '%' }"
        />
      </div>
      <span class="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        {{ avancement.faites }}/{{ avancement.total }} · {{ avancement.pct }}%
      </span>
    </div>

    <div
      v-if="actions?.length"
      class="space-y-1"
    >
      <template
        v-for="a in [...actions].sort((x, y) => ORDRE.indexOf(x.statut) - ORDRE.indexOf(y.statut))"
        :key="a.id"
      >
        <div class="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary-50">
          <button
            :disabled="!editable || busy === a.id"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-default"
            :class="[TONE[a.statut], editable ? 'hover:brightness-95' : '']"
            :title="editable ? 'Cliquer pour faire avancer le statut' : ''"
            @click="basculer(a)"
          >
            <Icon
              :name="a.statut === 'fait' ? 'lucide:check-circle-2' : a.statut === 'en_cours' ? 'lucide:loader-circle' : a.statut === 'abandonnee' ? 'lucide:circle-slash' : 'lucide:circle'"
              class="size-3.5"
            />
            {{ labelOf(nis2ActionStatuts, a.statut) }}
          </button>

          <span
            class="text-sm"
            :class="a.statut === 'fait' || a.statut === 'abandonnee' ? 'text-secondary-400 line-through' : 'text-secondary-800'"
          >{{ a.intitule }}</span>

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

          <span class="ml-auto flex items-center gap-2">
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
            <button
              class="rounded p-0.5 transition-colors hover:bg-secondary-100 hover:text-secondary-600"
              :class="a.description ? 'text-primary-500' : 'text-secondary-300'"
              :title="a.description ? 'Voir la description' : 'Ajouter une description'"
              :aria-expanded="deplie === a.id"
              @click="basculerDetail(a)"
            >
              <Icon
                :name="deplie === a.id ? 'lucide:chevron-up' : 'lucide:align-left'"
                class="size-3.5"
              />
            </button>
            <NuxtLink
              :to="`/actions-nis2/${a.id}`"
              class="rounded p-0.5 text-secondary-300 transition-colors hover:bg-secondary-100 hover:text-secondary-600"
              title="Ouvrir la fiche"
            >
              <Icon
                name="lucide:arrow-up-right"
                class="size-3.5"
              />
            </NuxtLink>
            <button
              v-if="editable"
              aria-label="Supprimer"
              class="rounded p-0.5 text-secondary-300 transition-colors hover:bg-secondary-100 hover:text-red-600"
              @click="supprimer(a.id)"
            >
              <Icon
                name="lucide:x"
                class="size-3.5"
              />
            </button>
          </span>
        </div>

        <div
          v-if="deplie === a.id"
          class="mb-1 ml-2 space-y-2 rounded-lg border-l-2 border-primary-200 bg-secondary-50/60 px-3 py-2"
        >
          <template v-if="editable">
            <span :class="LIBELLE">Description</span>
            <textarea
              v-model="brouillon"
              rows="3"
              placeholder="Précisions sur ce qu'il faut faire, périmètre, contraintes…"
              :class="[CHAMP, 'w-full']"
            />
            <div class="flex items-center gap-2">
              <button
                class="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700"
                @click="enregistrerDescription(a)"
              >
                <Icon
                  name="lucide:check"
                  class="size-3.5"
                /> Enregistrer
              </button>
              <button
                class="rounded-lg px-3 py-1.5 text-xs text-secondary-500 transition-colors hover:bg-secondary-100"
                @click="deplie = ''"
              >
                Annuler
              </button>
            </div>
          </template>
          <p
            v-else
            class="whitespace-pre-line text-sm"
            :class="a.description ? 'text-secondary-700' : 'text-secondary-400'"
          >
            {{ a.description || 'Aucune description.' }}
          </p>
        </div>
      </template>
    </div>
    <p
      v-else
      class="text-sm text-secondary-400"
    >
      Aucune action planifiée pour cette exigence.
    </p>

    <div
      v-if="editable"
      class="space-y-3 border-t border-secondary-100 pt-3"
    >
      <p class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">
        Ajouter une action
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="flex flex-col gap-1 sm:col-span-2">
          <span :class="LIBELLE">Action à mener</span>
          <input
            v-model="form.intitule"
            placeholder="ex. Rédiger la politique de sécurité"
            :class="CHAMP"
            @keyup.enter="ajouter"
          >
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LIBELLE">Priorité</span>
          <select
            v-model="form.priorite"
            :class="CHAMP"
          >
            <option
              v-for="p in nis2ActionPriorites"
              :key="p.value"
              :value="p.value"
            >{{ p.label }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LIBELLE">Échéance</span>
          <input
            v-model="form.echeance"
            type="date"
            :class="CHAMP"
          >
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LIBELLE">Responsable (pilotage)</span>
          <select
            v-model="form.responsableId"
            :class="CHAMP"
          >
            <option value="">Non attribué</option>
            <option
              v-for="p in optionsPersonnes"
              :key="p.id"
              :value="p.id"
            >{{ p.label }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LIBELLE">Mise en œuvre technique</span>
          <select
            v-model="form.technicienId"
            :class="CHAMP"
          >
            <option value="">Non attribué</option>
            <option
              v-for="p in optionsPersonnes"
              :key="p.id"
              :value="p.id"
            >{{ p.label }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 sm:col-span-2">
          <span :class="LIBELLE">Description (optionnelle)</span>
          <textarea
            v-model="form.description"
            rows="2"
            placeholder="Précisions sur ce qu'il faut faire, périmètre, contraintes…"
            :class="CHAMP"
          />
        </label>
      </div>
      <button
        :disabled="ajout || !form.intitule.trim()"
        class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
        @click="ajouter"
      >
        <Icon
          name="lucide:plus"
          class="size-4"
        /> Ajouter
      </button>
    </div>
  </DetailSection>
</template>
