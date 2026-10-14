<script setup lang="ts">
// COMPTEURS RÉGLEMENTAIRES — miroir de Sniff. Le Catalogue ne décide plus rien ici.
import Pill from '~/components/ui/Pill.vue'

const api = useApi()

type Compteur = {
  incidentId: string
  cle: string
  libelle: string
  depart: string | null
  condition: string | null
  porteur: string | null
  defaut: string | null
  applicable: boolean | null
  decidePar: string | null
  decideLe: string | null
  court: boolean
  echeance: string | null
  deposeLe: string | null
  reference: string | null
  deposePar: string | null
  majLe: string | null
  type: string | null
  severity: string | null
  niveau: string | null
  statut: string | null
  knowledgeAt: string | null
  knowledgeEstimated: boolean | null
  joursRestants: number | null
  depassee: boolean
  aTrancher: boolean
}
type Source = {
  dernierAccesAt: string | null
  dernierStatut: string
  dernierMessage: string | null
}
type Liste = {
  total: number
  tri: string
  source: Source
  avertissement: string
  resultats: Compteur[]
}
type Resume = {
  total: number
  courent: number
  echues: number
  sousUnJour: number
  deposes: number
  aTrancher: number
  incidents: number
  source: Source
}

const filtre = ref<'' | 'court' | 'echues' | 'aTrancher' | 'deposes'>('')
const requete = computed(() => (filtre.value ? `?${filtre.value}=true` : ''))

const { data: liste, refresh } = await useAsyncData(
  () => `nis2-echeances-${filtre.value}`,
  () => api<Liste>(`/api/nis2/echeances${requete.value}`),
  { getCachedData: () => undefined, watch: [requete] },
)
const { data: resume, refresh: refreshResume } = await useAsyncData(
  'nis2-echeances-resume',
  () => api<Resume>('/api/nis2/echeances/resume'),
  { getCachedData: () => undefined },
)

const perms = await usePermissions()
const busy = ref(false)
const msg = ref('')

const relever = async () => {
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{ incidents: number, echeances: number, erreur: string | null, deposesHorsSniff: number }>(
      '/api/nis2/echeances/sync', { method: 'POST' },
    )
    msg.value = r.erreur
      ? r.erreur
      : `${r.incidents} incident(s), ${r.echeances} compteur(s) relevé(s).`
        + (r.deposesHorsSniff ? ` ${r.deposesHorsSniff} dépôt(s) connu(s) du Catalogue seul.` : '')
    await Promise.all([refresh(), refreshResume()])
  }
  catch (e: unknown) {
    msg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Relevé impossible.'
  }
  finally { busy.value = false }
}

const dateFr = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '—')
const dateHeureFr = (s: string | null) => (s ? new Date(s).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—')

// Fraîcheur de la source. Sans elle, un miroir vide et un connecteur en panne se
// ressemblent — et le second ferait croire qu'aucune échéance ne court.
const fraicheur = computed(() => {
  const s = resume.value?.source?.dernierAccesAt ?? liste.value?.source?.dernierAccesAt
  if (!s) return null
  const min = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  return min < 1 ? 'à l\'instant' : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`
})
const sourceEnPanne = computed(() =>
  (resume.value?.source?.dernierStatut ?? liste.value?.source?.dernierStatut) === 'erreur')

// Un compteur DÉPOSÉ n'est jamais en retard, même avec des jours restants négatifs : c'est
// `court` qui fait foi.
const ton = (c: Compteur) => {
  if (c.deposeLe) return 'emerald'
  if (c.aTrancher) return 'amber'
  if (!c.court) return 'gray'
  if (c.depassee) return 'red'
  return (c.joursRestants ?? 99) <= 1 ? 'orange' : 'blue'
}
const etat = (c: Compteur) => {
  if (c.deposeLe) return `Déposé le ${dateFr(c.deposeLe)}`
  if (c.aTrancher) return 'Applicabilité non déterminée'
  if (!c.court) return c.applicable === false ? 'Non applicable' : 'Non décompté'
  if (c.depassee) return `Échu depuis ${Math.abs(c.joursRestants ?? 0)} j`
  return c.joursRestants === 0 ? 'Échéance aujourd\'hui' : `${c.joursRestants} j restants`
}

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="flex items-center gap-2 tracking-tight text-secondary-900">
        <Icon
          name="lucide:gavel"
          class="size-5 text-primary-500"
        />
        Compteurs réglementaires
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        NIS 2 (24 h / 72 h / 1 mois), notification CNIL et CERT RENATER.
        L'applicabilité de chaque compteur et l'enregistrement des dépôts relèvent de Sniff, au niveau
        de l'incident. Cet écran présente les données relevées et déclenche les alertes correspondantes.
      </p>
    </header>

    <!-- TÉMOIN DE FRAÎCHEUR. Sans lui, un miroir vide et un connecteur en panne se
         ressemblent — et le second ferait croire qu'aucune échéance ne court. -->
    <section
      class="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-4 py-3 text-sm"
      :class="sourceEnPanne
        ? 'border-red-200 bg-red-50/60 text-red-800'
        : 'border-secondary-200/70 bg-secondary-50/40 text-secondary-600'"
    >
      <span class="flex items-center gap-1.5">
        <Icon
          :name="sourceEnPanne ? 'lucide:plug-zap' : 'lucide:refresh-cw'"
          class="size-4"
        />
        Relevé chez Sniff <strong>{{ fraicheur ?? 'jamais' }}</strong>
      </span>
      <span
        v-if="resume?.source?.dernierMessage"
        class="text-xs opacity-80"
      >{{ resume.source.dernierMessage }}</span>
      <button
        v-if="perms.isAdmin.value"
        class="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 bg-white px-3 py-1.5 text-xs text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-50"
        :disabled="busy"
        @click="relever"
      >
        <Icon
          name="lucide:refresh-cw"
          class="size-3.5"
          :class="busy ? 'animate-spin' : ''"
        /> Relever maintenant
      </button>
    </section>
    <p
      v-if="msg"
      class="text-sm text-secondary-600"
    >
      {{ msg }}
    </p>

    <p
      v-if="!resume?.total"
      :class="[TUILE, 'text-sm text-secondary-500']"
    >
      Aucun compteur relevé. En l'absence de relevé abouti, cette absence ne permet pas de conclure
      qu'aucune échéance n'est en cours.
    </p>

    <section
      v-if="resume?.total"
      class="grid grid-cols-2 gap-3 sm:grid-cols-5"
    >
      <button
        v-for="t in [
          { label: 'Échus', n: resume.echues, sub: 'et non déposés', f: 'echues' as const, alerte: resume.echues > 0 },
          { label: 'En cours', n: resume.courent, sub: 'à surveiller', f: 'court' as const, alerte: false },
          { label: 'Sous 24 h', n: resume.sousUnJour, sub: 'échéance proche', f: 'court' as const, alerte: resume.sousUnJour > 0 },
          { label: 'Non déterminés', n: resume.aTrancher, sub: 'applicabilité', f: 'aTrancher' as const, alerte: resume.aTrancher > 0 },
          { label: 'Déposés', n: resume.deposes, sub: 'déclarations enregistrées', f: 'deposes' as const, alerte: false },
        ]"
        :key="t.label"
        class="rounded-xl border p-3 text-left transition-colors"
        :class="[
          filtre === t.f ? 'border-primary-400 ring-2 ring-primary-500/20' : 'border-secondary-200/70',
          t.alerte ? 'bg-red-50/40' : 'bg-white hover:bg-secondary-50/50',
        ]"
        @click="filtre = filtre === t.f ? '' : t.f"
      >
        <span
          class="block text-xl font-semibold leading-none tracking-tight"
          :class="t.alerte ? 'text-red-700' : 'text-secondary-900'"
        >{{ t.n }}</span>
        <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
        <span class="mt-0.5 block text-[11px] text-secondary-400">{{ t.sub }}</span>
      </button>
    </section>

    <p
      v-if="filtre"
      class="flex items-center gap-2 text-xs text-secondary-500"
    >
      Filtre appliqué
      <button
        class="rounded border border-secondary-200 px-1.5 py-0.5 hover:bg-secondary-50"
        @click="filtre = ''"
      >
        tout afficher
      </button>
    </p>

    <div class="space-y-2">
      <article
        v-for="c in liste?.resultats ?? []"
        :key="c.incidentId + c.cle"
        class="rounded-xl border bg-white px-4 py-3"
        :class="c.court && c.depassee ? 'border-red-200 bg-red-50/40' : 'border-secondary-200/60'"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium tracking-tight text-secondary-900">{{ c.libelle }}</span>
          <span class="font-mono text-xs text-secondary-500">{{ c.incidentId }}</span>
          <Pill
            v-if="c.niveau"
            tone="gray"
          >
            {{ c.niveau }}
          </Pill>

          <!-- LA GRILLE ET LA DÉCISION, séparées. Les fusionner effacerait la différence
               entre « la grille dit oui » et « quelqu'un a décidé oui ». -->
          <Pill
            v-if="c.applicable !== null"
            :tone="c.applicable ? 'blue' : 'gray'"
            :title="`Décidé par ${c.decidePar ?? 'quelqu\'un'} le ${dateFr(c.decideLe)}`"
          >
            {{ c.applicable ? 'Décidé applicable' : 'Décidé non applicable' }}
          </Pill>
          <Pill
            v-else
            tone="gray"
            title="Valeur prévue par la grille de classification de Sniff, en l'absence de décision enregistrée."
          >
            Grille : {{ c.defaut ?? '—' }}
          </Pill>

          <Pill :tone="ton(c)">
            {{ etat(c) }}
          </Pill>

          <span class="ml-auto font-mono text-[10px] text-secondary-400">{{ c.echeance ? dateFr(c.echeance) : '—' }}</span>
        </div>

        <p class="mt-1 flex flex-wrap gap-x-4 text-[11px] text-secondary-500">
          <span v-if="c.porteur">Porteur : <strong class="text-secondary-700">{{ c.porteur }}</strong></span>
          <span v-if="c.knowledgeAt">
            Connaissance : {{ dateHeureFr(c.knowledgeAt) }}
            <!-- Une date estimée change la lecture d'un retard : le dire. -->
            <em v-if="c.knowledgeEstimated">(estimée)</em>
          </span>
          <span v-if="c.reference">Référence : <strong class="text-secondary-700">{{ c.reference }}</strong></span>
          <span v-if="c.deposePar">Déposé par {{ c.deposePar }}</span>
        </p>

        <!-- `condition` est un TEXTE qui change selon les réglages de Sniff : affiché tel
             quel, jamais analysé. -->
        <p
          v-if="c.condition"
          class="mt-1 text-[11px] italic text-secondary-400"
        >
          {{ c.condition }}
        </p>

        <p
          v-if="c.aTrancher"
          class="mt-1.5 text-[11px] text-amber-700"
        >
          Applicabilité non déterminée. Aucun délai n'est décompté tant que la décision n'est pas
          enregistrée. Décision à porter dans Sniff, sur l'incident {{ c.incidentId }}.
        </p>
      </article>

      <p
        v-if="resume?.total && !liste?.resultats?.length"
        :class="[TUILE, 'text-sm text-secondary-500']"
      >
        Aucun compteur ne correspond à ce filtre.
      </p>
    </div>

    <p
      v-if="liste?.avertissement"
      class="text-[11px] leading-relaxed text-secondary-400"
    >
      {{ liste.avertissement }} Tri : {{ liste.tri }}.
    </p>
  </div>
</template>
