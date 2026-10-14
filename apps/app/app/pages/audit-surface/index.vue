<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
// AUDIT DE SURFACE EXTERNE — les constats du moteur, et les découvertes à valider.

type Constat = {
  id: string
  actifHote: string
  actifPort: number | null
  actifUrl: string | null
  serviceId: string | null
  categorie: string
  gravite: string
  titre: string
  detail: string | null
  preuve: string | null
  reference: string | null
  premierReleveLe: string
  dernierReleveLe: string
  observations: number
  statut: string
  acceptationMotif: string | null
  acceptationEcheance: string | null
  decisionPar: string | null
  decisionLe: string | null
  reouvertLe: string | null
  traitement: string | null
  traitementMotif: string | null
  sniffIncidentId: string | null
}
type Resume = {
  configure: boolean
  dernierSyncAt: string | null
  dernierStatut: string
  dernierMessage: string | null
  ouvertsParGravite: Record<string, number>
  parStatut: Record<string, number>
  decouvertesAValider: number
}
type Personne = { id: string, nom: string, prenom: string | null }

const api = useApi()
const perms = await usePermissions()
const modifiable = computed(() => perms.canPropose('audit-surface'))

const filtre = reactive({ statut: 'ouvert', gravite: '' })
const { data: resume, refresh: rafraichirResume } = await useAsyncData(
  'audit-resume', () => api<Resume>('/api/audit-surface/resume'), { getCachedData: () => undefined },
)
const { data: constats, refresh: rafraichirConstats } = await useAsyncData(
  'audit-constats',
  () => api<{ total: number, resultats: Constat[] }>('/api/audit-surface/constats', { query: { statut: filtre.statut || undefined, gravite: filtre.gravite || undefined } }),
  { watch: [() => filtre.statut, () => filtre.gravite], getCachedData: () => undefined },
)
const { data: decouvertes, refresh: rafraichirDecouvertes } = await useAsyncData(
  'audit-decouvertes', () => api<Constat[]>('/api/audit-surface/decouvertes'), { getCachedData: () => undefined },
)
const { data: personnes } = await useAsyncData(
  'audit-personnes', () => api<Personne[]>('/api/personnes').catch(() => []), { getCachedData: () => undefined },
)

const GRAVITE: Record<string, { l: string, t: string }> = {
  critique: { l: 'Critique', t: 'red' },
  elevee: { l: 'Élevée', t: 'red' },
  moyenne: { l: 'Moyenne', t: 'amber' },
  faible: { l: 'Faible', t: 'blue' },
  info: { l: 'Info', t: 'gray' },
}
const STATUT: Record<string, { l: string, t: string }> = {
  ouvert: { l: 'Ouvert', t: 'amber' },
  accepte: { l: 'Risque accepté', t: 'purple' },
  corrige: { l: 'Déclaré corrigé', t: 'blue' },
  reteste: { l: 'Correction vérifiée', t: 'emerald' },
}
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—')
const nomPersonne = (p: Personne) => `${p.prenom ? `${p.prenom} ` : ''}${p.nom}`

const msg = ref('')
const busy = ref(false)
const ouvert = ref<string | null>(null)
const decision = reactive({ motif: '', echeance: '' })

const rafraichir = () => Promise.all([rafraichirResume(), rafraichirConstats(), rafraichirDecouvertes()])

const decider = async (c: Constat, action: 'accepter' | 'corriger' | 'verifier' | 'rouvrir') => {
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{ queued?: boolean }>(`/api/audit-surface/constats/${c.id}/decision`, {
      method: 'POST',
      body: { action, motif: decision.motif || undefined, echeance: decision.echeance || undefined },
    })
    msg.value = r?.queued ? 'Décision envoyée pour validation.' : 'Décision enregistrée.'
    ouvert.value = null
    decision.motif = ''
    decision.echeance = ''
    await rafraichir()
  }
  catch (e) { msg.value = messageErreur(e, 'La décision n\'a pas été enregistrée.') }
  finally { busy.value = false }
}

// LIAISON À UN INCIDENT SNIFF. Le Catalogue ne crée pas l'incident — le connecteur Sniff est en
// lecture seule : on le déclare dans Sniff, puis on le relie ici.
type IncidentSniff = { id: string, type: string, severity: string, status: string, createdAt: string }
const incidentsDe = reactive<Record<string, { chargement: boolean, motif: string | null, incidents: IncidentSniff[], choix: string }>>({})
const chercherIncidents = async (c: Constat) => {
  incidentsDe[c.id] = { chargement: true, motif: null, incidents: [], choix: '' }
  try {
    const r = await api<{ rapprochable: boolean, motif: string | null, incidents: IncidentSniff[] }>(`/api/audit-surface/constats/${c.id}/incidents`)
    incidentsDe[c.id] = {
      chargement: false,
      // Rapprochable et vide : aucun incident sur cette machine. Non rapprochable : on ne peut
      // pas le savoir, et le motif dit quel maillon manque.
      motif: r.rapprochable ? (r.incidents.length ? null : 'Aucun incident Sniff sur la machine de ce service. Déclarez-le dans Sniff, puis reliez-le ici.') : r.motif,
      incidents: r.incidents,
      choix: '',
    }
  }
  catch (e) {
    incidentsDe[c.id] = { chargement: false, motif: messageErreur(e, 'Sniff n\'a pas pu être interrogé.'), incidents: [], choix: '' }
  }
}
const lierIncident = async (c: Constat, id: string | null) => {
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{ queued?: boolean }>(`/api/audit-surface/constats/${c.id}/incident`, { method: 'POST', body: { sniffIncidentId: id } })
    msg.value = r?.queued ? 'Liaison envoyée pour validation.' : id ? 'Constat relié à l\'incident Sniff.' : 'Liaison retirée.'
    incidentsDe[c.id] = { chargement: false, motif: null, incidents: [], choix: '' }
    await rafraichirConstats()
  }
  catch (e) { msg.value = messageErreur(e, 'La liaison n\'a pas été enregistrée.') }
  finally { busy.value = false }
}

const choix = reactive<Record<string, { proprietaireId: string, libelle: string, motif: string }>>({})
const formulaire = (id: string) => (choix[id] ??= { proprietaireId: '', libelle: '', motif: '' })

const inscrire = async (d: Constat) => {
  const f = formulaire(d.id)
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{ queued?: boolean }>(`/api/audit-surface/decouvertes/${d.id}/inscrire`, {
      method: 'POST', body: { proprietaireId: f.proprietaireId, libelle: f.libelle || undefined },
    })
    msg.value = r?.queued ? 'Inscription envoyée pour validation.' : `${d.actifHote} inscrit dans les sites et services.`
    await rafraichir()
  }
  catch (e) { msg.value = messageErreur(e, 'L\'inscription a échoué.') }
  finally { busy.value = false }
}

const ecarter = async (d: Constat) => {
  const f = formulaire(d.id)
  busy.value = true
  msg.value = ''
  try {
    await api(`/api/audit-surface/decouvertes/${d.id}/ecarter`, { method: 'POST', body: { motif: f.motif } })
    msg.value = `${d.actifHote} écarté.`
    await rafraichir()
  }
  catch (e) { msg.value = messageErreur(e, 'La découverte n\'a pas été écartée.') }
  finally { busy.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6">
    <header class="space-y-1">
      <UITitle class="tracking-tight text-secondary-900">
        Audit de surface externe
      </UITitle>
      <p class="text-sm text-secondary-600">
        Constats relevés depuis l'extérieur par le moteur d'audit. Le Catalogue les suit et fait décider ; il n'audite pas.
      </p>
      <NuxtLink
        to="/audit-surface/tableau"
        class="inline-block text-sm text-primary-700 hover:underline"
      >
        Tableau de bord et rapport par composante
      </NuxtLink>
    </header>

    <p
      v-if="resume && !resume.configure"
      class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      Le moteur d'audit n'est pas configuré : aucun constat ne peut arriver.
      <NuxtLink
        to="/audit-surface/connecteur"
        class="underline"
      >
        Configurer le moteur
      </NuxtLink>
    </p>
    <p
      v-else-if="resume?.dernierStatut === 'erreur'"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      Dernière synchronisation en échec : {{ resume.dernierMessage }}
    </p>

    <!-- CE QUI RESTE À DÉCIDER d'abord : les ouverts par gravité, puis les découvertes. -->
    <section
      v-if="resume"
      class="grid grid-cols-2 gap-3 sm:grid-cols-6"
    >
      <div
        v-for="g in ['critique', 'elevee', 'moyenne', 'faible', 'info']"
        :key="g"
        class="rounded-xl border border-secondary-200/60 bg-white px-3 py-2"
      >
        <span class="block text-2xl font-semibold tabular-nums text-secondary-900">{{ resume.ouvertsParGravite[g] ?? 0 }}</span>
        <span class="text-[11px] text-secondary-600">ouvert(s) · {{ GRAVITE[g]?.l }}</span>
      </div>
      <div class="rounded-xl border border-secondary-200/60 bg-white px-3 py-2">
        <span class="block text-2xl font-semibold tabular-nums text-secondary-900">{{ resume.decouvertesAValider }}</span>
        <span class="text-[11px] text-secondary-600">découverte(s) à valider</span>
      </div>
    </section>

    <p
      v-if="msg"
      class="text-sm text-secondary-700"
    >
      {{ msg }}
    </p>

    <section
      v-if="decouvertes?.length"
      class="space-y-3 rounded-2xl border border-secondary-200/60 bg-white p-5"
    >
      <h2 class="text-sm font-semibold text-secondary-900">
        Découvertes à valider
      </h2>
      <p class="text-xs text-secondary-500">
        Actifs trouvés par le moteur et absents de l'inventaire. Aucun n'est inscrit d'office : inscrire demande un propriétaire, écarter demande un motif.
      </p>
      <div
        v-for="d in decouvertes"
        :key="d.id"
        class="flex flex-wrap items-end gap-3 border-t border-secondary-100 pt-3"
      >
        <div class="min-w-56 flex-1">
          <p class="font-medium text-secondary-900">
            {{ d.actifHote }}<span v-if="d.actifPort">:{{ d.actifPort }}</span>
          </p>
          <p class="text-xs text-secondary-500">
            {{ d.titre }} — vu le {{ date(d.dernierReleveLe) }}
          </p>
        </div>
        <template v-if="modifiable">
          <select
            v-model="formulaire(d.id).proprietaireId"
            class="rounded-lg border border-secondary-200 px-2 py-1.5 text-sm"
          >
            <option value="">
              Propriétaire…
            </option>
            <option
              v-for="p in personnes ?? []"
              :key="p.id"
              :value="p.id"
            >
              {{ nomPersonne(p) }}
            </option>
          </select>
          <UIButton
            :disabled="busy || !formulaire(d.id).proprietaireId"
            @click="inscrire(d)"
          >
            Inscrire
          </UIButton>
          <input
            v-model="formulaire(d.id).motif"
            placeholder="Motif de l'écart"
            class="rounded-lg border border-secondary-200 px-2 py-1.5 text-sm"
          >
          <UIButton
            variant="secondary"
            :disabled="busy || !formulaire(d.id).motif.trim()"
            @click="ecarter(d)"
          >
            Écarter
          </UIButton>
        </template>
      </div>
    </section>

    <section class="space-y-3 rounded-2xl border border-secondary-200/60 bg-white p-5">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-sm font-semibold text-secondary-900">
          Constats
        </h2>
        <select
          v-model="filtre.statut"
          class="rounded-lg border border-secondary-200 px-2 py-1 text-sm"
        >
          <option value="">
            Tous les statuts
          </option>
          <option
            v-for="(s, k) in STATUT"
            :key="k"
            :value="k"
          >
            {{ s.l }}
          </option>
        </select>
        <select
          v-model="filtre.gravite"
          class="rounded-lg border border-secondary-200 px-2 py-1 text-sm"
        >
          <option value="">
            Toutes les gravités
          </option>
          <option
            v-for="(g, k) in GRAVITE"
            :key="k"
            :value="k"
          >
            {{ g.l }}
          </option>
        </select>
        <span class="text-xs text-secondary-500">{{ constats?.total ?? 0 }} constat(s)</span>
      </div>

      <p
        v-if="!constats?.resultats.length"
        class="text-sm text-secondary-500"
      >
        Aucun constat pour ce filtre.
      </p>
      <article
        v-for="c in constats?.resultats ?? []"
        :key="c.id"
        class="space-y-2 border-t border-secondary-100 pt-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <Pill :tone="GRAVITE[c.gravite]?.t">
            {{ GRAVITE[c.gravite]?.l ?? c.gravite }}
          </Pill>
          <Pill :tone="STATUT[c.statut]?.t">
            {{ STATUT[c.statut]?.l ?? c.statut }}
          </Pill>
          <span class="font-medium text-secondary-900">{{ c.titre }}</span>
        </div>
        <p class="text-xs text-secondary-500">
          <NuxtLink
            v-if="c.serviceId"
            :to="`/sites-services/${c.serviceId}`"
            class="underline"
          >
            {{ c.actifHote }}<span v-if="c.actifPort">:{{ c.actifPort }}</span>
          </NuxtLink>
          <span v-else>{{ c.actifHote }}<span v-if="c.actifPort">:{{ c.actifPort }}</span> (hors inventaire)</span>
          · {{ c.categorie }} · vu {{ c.observations }} fois, du {{ date(c.premierReleveLe) }} au {{ date(c.dernierReleveLe) }}
          <span v-if="c.reference"> · {{ c.reference }}</span>
          <span
            v-if="c.reouvertLe"
            class="text-amber-700"
          > · rouvert le {{ date(c.reouvertLe) }}</span>
        </p>
        <p
          v-if="c.detail"
          class="text-sm text-secondary-700"
        >
          {{ c.detail }}
        </p>
        <p
          v-if="c.preuve"
          class="break-all font-mono text-xs text-secondary-500"
        >
          {{ c.preuve }}
        </p>
        <p
          v-if="c.statut === 'accepte'"
          class="text-xs text-purple-700"
        >
          Accepté jusqu'au {{ date(c.acceptationEcheance) }} — {{ c.acceptationMotif }} ({{ c.decisionPar ?? 'auteur inconnu' }})
        </p>

        <div
          v-if="modifiable"
          class="flex flex-wrap items-end gap-2"
        >
          <UIButton
            v-if="c.statut === 'ouvert' || c.statut === 'accepte'"
            variant="secondary"
            :disabled="busy"
            @click="decider(c, 'corriger')"
          >
            Déclarer corrigé
          </UIButton>
          <UIButton
            v-if="c.statut === 'corrige'"
            variant="secondary"
            :disabled="busy"
            @click="decider(c, 'verifier')"
          >
            Correction vérifiée
          </UIButton>
          <UIButton
            v-if="c.statut !== 'ouvert'"
            variant="secondary"
            :disabled="busy"
            @click="decider(c, 'rouvrir')"
          >
            Rouvrir
          </UIButton>
          <UIButton
            v-if="c.statut === 'ouvert'"
            variant="secondary"
            :disabled="busy"
            @click="ouvert = ouvert === c.id ? null : c.id"
          >
            Accepter le risque…
          </UIButton>
          <template v-if="ouvert === c.id">
            <input
              v-model="decision.motif"
              placeholder="Motif (décision RSSI)"
              class="min-w-64 rounded-lg border border-secondary-200 px-2 py-1.5 text-sm"
            >
            <input
              v-model="decision.echeance"
              type="date"
              class="rounded-lg border border-secondary-200 px-2 py-1.5 text-sm"
            >
            <UIButton
              :disabled="busy || !decision.motif.trim() || !decision.echeance"
              @click="decider(c, 'accepter')"
            >
              Enregistrer l'acceptation
            </UIButton>
          </template>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <template v-if="c.sniffIncidentId">
            <Pill tone="purple">
              Incident Sniff {{ c.sniffIncidentId }}
            </Pill>
            <UIButton
              v-if="modifiable"
              variant="ghost"
              :disabled="busy"
              @click="lierIncident(c, null)"
            >
              Délier
            </UIButton>
          </template>
          <template v-else-if="modifiable">
            <UIButton
              variant="ghost"
              :disabled="incidentsDe[c.id]?.chargement"
              @click="chercherIncidents(c)"
            >
              Relier à un incident Sniff…
            </UIButton>
            <span
              v-if="incidentsDe[c.id]?.motif"
              class="text-secondary-500"
            >{{ incidentsDe[c.id]?.motif }}</span>
            <template v-if="incidentsDe[c.id]?.incidents.length">
              <select
                v-model="incidentsDe[c.id]!.choix"
                class="rounded-lg border border-secondary-200 px-2 py-1.5 text-sm"
              >
                <option value="">
                  Incident…
                </option>
                <option
                  v-for="i in incidentsDe[c.id]!.incidents"
                  :key="i.id"
                  :value="i.id"
                >
                  {{ i.type }} · {{ i.severity }} · {{ i.status }} · {{ new Date(i.createdAt).toLocaleDateString('fr-FR') }}
                </option>
              </select>
              <UIButton
                :disabled="busy || !incidentsDe[c.id]!.choix"
                @click="lierIncident(c, incidentsDe[c.id]!.choix)"
              >
                Relier
              </UIButton>
            </template>
          </template>
        </div>
      </article>
    </section>
  </div>
</template>
