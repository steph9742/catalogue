<script setup lang="ts">
// Incidents Slowpoke (lecture seule) — configuration du connecteur + liste live.
// Slowpoke reste la source de vérité ; Catalogue n'affiche qu'un reflet en lecture.

import { libelleGravite } from '~/utils/graviteIncident'

const api = useApi()
const perms = await usePermissions()
if (!perms.isAdmin.value) throw createError({ statusCode: 403, statusMessage: 'Réservé aux administrateurs' })

type Config = {
  url: string | null
  actif: boolean
  dernierStatut: string
  dernierMessage: string | null
  dernierAccesAt: string | null
  cleServiceDefinie: boolean
  secretWebhookDefini: boolean
}
type Incident = {
  id: string
  type: string
  severity: string
  status: string
  resolution: string | null
  /** Motif brut de clôture du SOC, quand la fiche le porte. Lit une résolution absente. */
  motifClotureSoc?: string | null
  description: string | null
  source: string | null
  createdAt: string
  updatedAt: string
}

const { data: config, refresh: refreshConfig } = await useAsyncData('sp-config', () => api<Config>('/api/slowpoke/config'), { getCachedData: () => undefined })

const f = reactive({ url: '', cleService: '', secretWebhook: '', actif: false })
watchEffect(() => {
  if (config.value) {
    f.url = config.value.url ?? ''
    f.actif = config.value.actif
  }
})

const msg = ref('')
const msgTon = ref<'ok' | 'err' | ''>('')
const busy = ref('')
const showConfig = ref(false)

const enregistrer = async () => {
  busy.value = 'save'
  msg.value = ''
  try {
    await api('/api/slowpoke/config', { method: 'PUT', body: { ...f } })
    f.cleService = ''
    f.secretWebhook = ''
    await refreshConfig()
    msg.value = 'Enregistré.'
    msgTon.value = 'ok'
  }
  catch {
    msg.value = 'Échec.'
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}
const tester = async () => {
  busy.value = 'test'
  msg.value = ''
  try {
    const r = await api<{ ok: boolean, message: string }>('/api/slowpoke/test', { method: 'POST', body: { url: f.url, cleService: f.cleService } })
    msg.value = r.message
    msgTon.value = r.ok ? 'ok' : 'err'
  }
  catch {
    msg.value = 'Test impossible.'
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}

// Incidents (live). Chargés seulement si le connecteur est configuré.
const filtreStatut = ref('')
const { data: res, pending, refresh: refreshIncidents } = await useAsyncData(
  'sp-incidents',
  () => api<{ ok: boolean, incidents: Incident[] }>(`/api/slowpoke/incidents${filtreStatut.value ? '?status=' + filtreStatut.value : ''}`).catch(() => ({ ok: false, incidents: [] as Incident[] })),
  { getCachedData: () => undefined, watch: [filtreStatut] },
)
const incidents = computed(() => res.value?.incidents ?? [])

const TYPE_LABEL: Record<string, string> = { phishing: 'Hameçonnage', malware: 'Maliciel', ransomware: 'Rançongiciel', data_breach: 'Violation de données', ddos: 'Déni de service', network_intrusion: 'Intrusion réseau', other: 'Autre' }
const STATUT_LABEL: Record<string, string> = { open: 'Ouvert', investigating: 'Investigation', in_progress: 'En cours', resolved: 'Résolu', closed: 'Clôturé' }

// LES LIBELLÉS DE RÉSOLUTION VIENNENT DE SNIFF, relayés par /api/lectures du Catalogue : le
// vocabulaire est le leur, et le recopier ici le ferait vieillir à leur prochaine valeur.
const { data: lectures } = await useAsyncData(
  'lectures-sniff',
  () => api<{ sniff?: { lues: boolean, contenu?: unknown } }>('/api/lectures').catch(() => null),
  { getCachedData: () => undefined },
)

// LE LIBELLÉ DE LA PASTILLE VIENT DE SNIFF, pas d'ici. Une valeur renommée change donc des deux
// côtés le même jour.
type LectureSniff = { valeur?: string, libelle?: string, signifie?: string, consequence?: string }

const lecturesResolution = computed(() => {
  const contenu = lectures.value?.sniff?.contenu as Record<string, unknown> | undefined
  const parValeur = new Map<string, LectureSniff>()
  const retenir = (e: Record<string, unknown> | undefined) => {
    if (typeof e?.valeur === 'string') parValeur.set(e.valeur, e as LectureSniff)
  }
  for (const bloc of [contenu?.lectures, contenu?.vocabulaires]) {
    if (!Array.isArray(bloc)) continue
    for (const e of bloc as Record<string, unknown>[]) {
      if (String(e?.champ ?? '').toLowerCase() !== 'resolution') continue
      retenir(e)
      // Un vocabulaire fermé porte ses valeurs en liste, chacune avec son propre libellé.
      if (Array.isArray(e?.valeurs)) for (const v of e.valeurs as Record<string, unknown>[]) retenir(v)
    }
  }
  return parValeur
})

const SEV_TONE: Record<string, string> = { low: 'border-secondary-200 bg-secondary-50 text-secondary-600', medium: 'border-blue-200 bg-blue-50 text-blue-700', high: 'border-orange-200 bg-orange-50 text-orange-700', critical: 'border-red-200 bg-red-50 text-red-700' }
const libelle = (i: Incident) => `${TYPE_LABEL[i.type] ?? i.type} — ${new Date(i.createdAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`
const CLOSES = ['resolved', 'closed']
const aideDe = (valeur: string, defaut: string) => {
  const l = lecturesResolution.value.get(valeur)
  // La phrase de Sniff, mot pour mot : c'est chez eux que la valeur est définie.
  return [l?.signifie, l?.consequence].filter(Boolean).join(' ') || defaut
}

// LE TON, lui, est une décision d'affichage, et il reste ici. Il tient compte des trois
// confusions que Sniff a nommées : `risk_accepted` n'est pas `true_positive` (rien n'a été
// corrigé), `benign` n'est pas `false_positive` (l'un appelle une correction de règle, l'autre
// non), et l'absence de…
const ATTENTION = ['risk_accepted', 'legitimate']

const resolutionDe = (i: Incident): { texte: string, ton: string, aide: string } | null => {
  if (i.resolution) {
    const court = lecturesResolution.value.get(i.resolution)?.libelle
    return {
      texte: court ?? i.resolution,
      ton: ATTENTION.includes(i.resolution)
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-secondary-200 bg-secondary-50 text-secondary-700',
      aide: aideDe(i.resolution, court
        ? `Résolution Sniff : ${i.resolution}`
        : `Résolution Sniff : ${i.resolution}. Son libellé n'a pas été relayé — la valeur est affichée telle quelle.`),
    }
  }
  // Sur une fiche encore ouverte, l'absence de résolution est normale : rien à signaler.
  if (!CLOSES.includes(i.status)) return null
  const court = lecturesResolution.value.get('null')?.libelle ?? 'Résolution non posée'
  return {
    texte: i.motifClotureSoc ? `${court} · ${i.motifClotureSoc}` : court,
    ton: 'border-amber-200 bg-amber-50 text-amber-800',
    aide: aideDe('null', 'Fiche close sans résolution : Sniff n\'a pas conclu. Ne pas lire comme un incident bénin.'),
  }
}

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const LIBELLE = 'font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Incidents (Slowpoke)
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Reflet en lecture seule des incidents cyber. Le traitement se fait dans Slowpoke.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="filtreStatut"
          :class="CHAMP"
        >
          <option value="">
            Tous les statuts
          </option>
          <option value="open">
            Ouverts
          </option>
          <option value="investigating">
            Investigation
          </option>
          <option value="in_progress">
            En cours
          </option>
          <option value="resolved">
            Résolus
          </option>
          <option value="closed">
            Clôturés
          </option>
        </select>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
          @click="refreshIncidents()"
        >
          <Icon
            name="lucide:refresh-cw"
            class="size-4"
          /> Rafraîchir
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
          @click="showConfig = !showConfig"
        >
          <Icon
            name="lucide:settings-2"
            class="size-4"
          /> Connecteur
        </button>
      </div>
    </header>

    <!-- Configuration (repliable) -->
    <section
      v-if="showConfig"
      :class="[TUILE, 'space-y-5']"
    >
      <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        <Icon
          name="lucide:plug"
          class="size-4 text-primary-500"
        /> Connexion Slowpoke
      </h2>
      <p class="text-xs text-secondary-500">
        Lecture des incidents via un <strong>compte de service Slowpoke</strong> (clé en lecture seule). La clé est stockée côté serveur, jamais renvoyée à l'interface.
      </p>
      <div class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 sm:col-span-2"><span :class="LIBELLE">URL de Slowpoke</span><input
          v-model="f.url"
          :class="CHAMP"
          placeholder="https://slowpoke.example.org"
        ></label>
        <label class="flex flex-col gap-1.5 sm:col-span-2"><span :class="LIBELLE">Clé de service {{ config?.cleServiceDefinie ? '(définie)' : '' }}</span><input
          v-model="f.cleService"
          type="password"
          :class="CHAMP"
          :placeholder="config?.cleServiceDefinie ? '•••••• (vide = inchangée)' : 'sk_…'"
        ></label>
        <!-- SECRET DU WEBHOOK ENTRANT. Sniff pousse deux événements — appariement et détachement d'une exclusion — et les signe en HMAC-SHA256. -->
        <label class="flex flex-col gap-1.5 sm:col-span-2"><span :class="LIBELLE">Secret du webhook entrant {{ config?.secretWebhookDefini ? '(défini)' : '' }}</span><input
          v-model="f.secretWebhook"
          type="password"
          :class="CHAMP"
          :placeholder="config?.secretWebhookDefini ? '•••••• (vide = inchangé)' : 'le même que côté Sniff'"
        >
          <span class="text-[11px] text-secondary-400">
            À déclarer à l'identique dans Sniff (Réglages → Webhooks), sur l'URL
            <code class="rounded bg-secondary-100 px-1">…/api/sniff/evenements</code>, pour les événements
            <code class="rounded bg-secondary-100 px-1">exclusion_appariee</code> et
            <code class="rounded bg-secondary-100 px-1">exclusion_detachee</code>.
          </span></label>
        <label class="flex items-center gap-2 text-sm text-secondary-700"><input
          v-model="f.actif"
          type="checkbox"
          class="size-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500/30"
        > Connecteur actif</label>
      </div>
      <!-- La case « ouvrir un suivi NIS 2 automatiquement » a été RETIRÉE. Elle promettait un comportement qui n'existe plus : le Catalogue ne décide plus de l'applicabilité et n'ouvre plus de suivi sur la gravité. -->
      <p class="text-xs text-secondary-500">
        L'applicabilité des compteurs réglementaires et l'enregistrement des déclarations relèvent de
        Sniff, au niveau de l'incident. Le Catalogue relève ces compteurs toutes les 30 minutes, les
        conserve et émet les alertes correspondantes —
        <NuxtLink
          to="/notifications-nis2"
          class="text-primary-600 hover:underline"
        >voir les compteurs réglementaires</NuxtLink>.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          :disabled="busy === 'save'"
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          @click="enregistrer"
        >
          <Icon
            name="lucide:save"
            class="size-4"
          /> Enregistrer
        </button>
        <button
          :disabled="busy === 'test'"
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-4 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-50"
          @click="tester"
        >
          <Icon
            name="lucide:plug-zap"
            class="size-4"
          /> Tester
        </button>
        <span
          v-if="msg"
          class="text-sm"
          :class="msgTon === 'ok' ? 'text-emerald-600' : 'text-red-600'"
        >{{ msg }}</span>
      </div>
    </section>

    <section
      v-if="pending"
      class="rounded-2xl border border-dashed border-primary-200/50 bg-primary-50/40 py-16 text-center font-mono text-sm text-primary-600"
    >
      Chargement des incidents…
    </section>
    <section
      v-else-if="!config?.url"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Connecteur non configuré. Cliquez sur « Connecteur » pour renseigner l'accès Slowpoke.
    </section>
    <section
      v-else-if="res && !res.ok"
      class="rounded-2xl border border-red-200 bg-red-50/60 p-6 text-sm text-red-700"
    >
      Impossible de lire les incidents Slowpoke. Vérifiez le connecteur (bouton « Connecteur »).
    </section>
    <section
      v-else-if="!incidents.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucun incident.
    </section>

    <section
      v-else
      class="grid grid-cols-1 gap-3"
    >
      <div
        v-for="i in incidents"
        :key="i.id"
        class="rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
            :class="SEV_TONE[i.severity]"
          >{{ libelleGravite(i.severity) }}</span>
          <span class="text-sm font-medium text-secondary-900">{{ libelle(i) }}</span>
          <span class="font-mono text-[10px] uppercase tracking-wide text-secondary-400">{{ i.id }}</span>
          <span
            v-if="resolutionDe(i)"
            class="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px]"
            :class="resolutionDe(i)!.ton"
            :title="resolutionDe(i)!.aide"
          >{{ resolutionDe(i)!.texte }}</span>
          <span class="ml-auto font-mono text-[10px] uppercase tracking-wide text-secondary-400">{{ STATUT_LABEL[i.status] ?? i.status }}</span>
        </div>
        <p
          v-if="i.description"
          class="mt-2 line-clamp-2 text-sm text-secondary-600"
        >
          {{ i.description }}
        </p>
      </div>
    </section>
  </div>
</template>
