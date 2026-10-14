<script setup lang="ts">
// Connecteur HarfangLab (EDR) — admin. Configuration, couverture du parc critique, et état des
// moteurs de détection.
import Pill from '~/components/ui/Pill.vue'

const api = useApi()
const perms = await usePermissions()
if (!perms.isAdmin.value) throw createError({ statusCode: 403, statusMessage: 'Réservé aux administrateurs' })

type Config = {
  url: string | null
  actif: boolean
  frequenceHeures: number
  dernierSyncAt: string | null
  dernierStatut: string
  dernierMessage: string | null
  jetonDefini: boolean
  marqueursTechniques: string[] | null
}
type Couverture = {
  dernierSyncAt: string | null
  dernierStatut: string
  reglesDeclarees: number
  comptes: {
    machines: number
    agents: number
    certains: number
    probables: number
    ambigus: number
    machinesSansAgent: number
    agentsSansMachine: number
    machinesSansSerieUtilisable: number
    agentsSansSerieUtilisable: number
  }
  sansAgent: {
    glpiId: string
    nom?: string | null
    entite?: string | null
  }[]
  ambigus: {
    machine: { glpiId: string, nom?: string | null }
    agents: string[]
    motif: string
  }[]
}
type Moteur = {
  politiqueId: string
  politiqueNom: string | null
  releveLe: string
  modes: Record<string, unknown> | null
  revisions: Record<string, number | null> | null
  changements: {
    champ: string
    avant: unknown
    apres: unknown
  }[] | null
}

const { data: config, refresh: refreshConfig } = await useAsyncData('hl-config', () => api<Config>('/api/harfanglab/config'), { getCachedData: () => undefined })
const { data: couverture, refresh: refreshCouverture } = await useAsyncData('hl-couverture', () => api<Couverture>('/api/harfanglab/couverture'), { getCachedData: () => undefined })
const { data: moteurs, refresh: refreshMoteurs } = await useAsyncData('hl-moteurs', () => api<Moteur[]>('/api/harfanglab/moteurs'), { getCachedData: () => undefined })
// LE PARC COMPLET : non critiques et agents hors GLPI, par la même route que les fiches.
type Parc = {
  total: { nonCritiques: number, nonCritiquesAvecAgent: number, nonCritiquesSansAgent: number, nonCritiquesAmbigus: number, machinesGlpi: number }
  agents: { total: number, liesCritiques: number, ambigusCritiques: number, liesNonCritiques: number, ambigusNonCritiques: number, sansMachineGlpi: number }
  agentsSansMachineGlpi: { agentId: string, hostname: string | null }[]
}
const { data: parc, refresh: refreshParc } = await useAsyncData('hl-parc', () => api<Parc>('/api/harfanglab/couverture/par-composante').catch(() => null), { getCachedData: () => undefined })

const f = reactive({ url: '', jeton: '', actif: false, frequenceHeures: 24, marqueursTechniques: '' })
watchEffect(() => {
  if (config.value) {
    f.url = config.value.url ?? ''
    f.actif = config.value.actif
    f.frequenceHeures = config.value.frequenceHeures
    f.marqueursTechniques = (config.value.marqueursTechniques ?? []).join(', ')
  }
})

const msg = ref('')
const msgTon = ref<'ok' | 'err' | ''>('')
const busy = ref('')

const enregistrer = async () => {
  busy.value = 'save'
  msg.value = ''
  try {
    await api('/api/harfanglab/config', {
      method: 'PUT',
      body: { ...f, marqueursTechniques: f.marqueursTechniques.split(',').map(m => m.trim()).filter(Boolean) },
    })
    f.jeton = '' // ne reste pas à l'écran
    await refreshConfig()
    msg.value = 'Configuration enregistrée.'
    msgTon.value = 'ok'
  }
  catch {
    msg.value = 'Échec de l\'enregistrement.'
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}
const tester = async () => {
  busy.value = 'test'
  msg.value = ''
  try {
    const r = await api<{ ok: boolean, message: string }>('/api/harfanglab/test', { method: 'POST', body: { url: f.url, jeton: f.jeton } })
    msg.value = r.message
    msgTon.value = r.ok ? 'ok' : 'err'
  }
  catch {
    msg.value = 'Test impossible.'
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}
// LA SYNCHRONISATION TOURNE CÔTÉ SERVEUR, l'écran la suit. Attendre la fin de la requête la
// faisait couper par le proxy : l'écran annonçait un échec pendant que le relevé continuait, et
// le rechargement disait « synchronisée ».
let minuteurSync: ReturnType<typeof setTimeout> | null = null
const suivreSync = async () => {
  await refreshConfig()
  if (config.value?.dernierStatut === 'en_cours') {
    minuteurSync = setTimeout(suivreSync, 3000)
    return
  }
  busy.value = ''
  msg.value = config.value?.dernierMessage ?? 'Synchronisation terminée.'
  msgTon.value = config.value?.dernierStatut === 'erreur' ? 'err' : 'ok'
  await Promise.all([refreshCouverture(), refreshMoteurs(), refreshParc(), refreshEntitesEdr()])
}

const synchroniser = async () => {
  busy.value = 'sync'
  msg.value = ''
  try {
    await api<{ ok: boolean, demarre: boolean }>('/api/harfanglab/sync', { method: 'POST' })
    msg.value = 'Synchronisation lancée : agents, moteurs et règles. Son avancement s\'affiche ici.'
    msgTon.value = 'ok'
    await suivreSync()
  }
  catch (e) {
    busy.value = ''
    msg.value = messageErreur(e, 'La synchronisation n\'a pas pu être lancée.')
    msgTon.value = 'err'
  }
}

// Une synchronisation lancée ailleurs — autre onglet, ordonnanceur — se suit aussi.
onMounted(() => {
  if (config.value?.dernierStatut === 'en_cours') {
    busy.value = 'sync'
    void suivreSync()
  }
})
onBeforeUnmount(() => {
  if (minuteurSync) clearTimeout(minuteurSync)
})

// RATTACHEMENT DES ENTITÉS EDR. Chaque valeur d'`additional_info1`, rattachée par déclaration
// ou par rapprochement exact ; ce qui ne l'est pas attend une décision, les plus gros effectifs
// en tête.
type CibleEdr = { type: 'etablissement' | 'composante' | 'service' | 'departement' | 'pole', id: string }
type ValeurEdr = { valeur: string, agents: number, source: 'declaree' | 'automatique' | null, motif: string, cible: CibleEdr | null, libelle: string | null, attendue: boolean }
type OptionUnite = { id: string, libelle: string }
type EntitesEdr = {
  agents: number
  sansEntite: number
  valeurs: ValeurEdr[]
  options: { etablissements: OptionUnite[], composantes: OptionUnite[], services: OptionUnite[], departements: OptionUnite[], poles: OptionUnite[] }
}
const { data: entitesEdr, refresh: refreshEntitesEdr } = await useAsyncData('hl-entites-edr', () => api<EntitesEdr>('/api/harfanglab/entites-edr').catch(() => null), { getCachedData: () => undefined })
const choixEdr = reactive<Record<string, string>>({})
watchEffect(() => {
  for (const v of entitesEdr.value?.valeurs ?? []) {
    if (!(v.valeur in choixEdr)) choixEdr[v.valeur] = v.cible ? `${v.cible.type}:${v.cible.id}` : ''
  }
})
const ETAT_EDR: Record<string, { l: string, t: string }> = {
  declaree: { l: 'déclarée', t: 'emerald' },
  exact: { l: 'automatique', t: 'blue' },
  ambigu: { l: 'ambiguë — plusieurs unités portent ce nom', t: 'amber' },
  aucun: { l: 'à rattacher', t: 'amber' },
  cible_disparue: { l: 'unité déclarée supprimée', t: 'red' },
}
const msgEdr = ref('')
const rattacherEdr = async (v: ValeurEdr, retour = false) => {
  msgEdr.value = ''
  const [type, id] = (choixEdr[v.valeur] ?? '').split(':')
  try {
    await api('/api/harfanglab/entites-edr', {
      method: 'POST',
      body: { valeur: v.valeur, cible: retour || !type || !id ? null : { type, id } },
    })
    if (retour) choixEdr[v.valeur] = ''
    msgEdr.value = retour ? `« ${v.valeur} » rendue au rapprochement automatique.` : `« ${v.valeur} » rattachée.`
    await Promise.all([refreshEntitesEdr(), refreshParc()])
  }
  catch (e) { msgEdr.value = messageErreur(e, 'Le rattachement n\'a pas été enregistré.') }
}

// Ses agents y seront comptés dès leur arrivée.
const unitesEdr = computed(() => {
  const o = entitesEdr.value?.options
  if (!o) return []
  return [
    { groupe: 'Établissement, sans composante', type: 'etablissement', liste: o.etablissements },
    { groupe: 'Composantes', type: 'composante', liste: o.composantes },
    { groupe: 'Services', type: 'service', liste: o.services },
    { groupe: 'Départements', type: 'departement', liste: o.departements },
    { groupe: 'Pôles', type: 'pole', liste: o.poles },
  ]
})
const nouvelleEdr = reactive({ valeur: '', cible: '' })
const declarerAVenir = async () => {
  msgEdr.value = ''
  const [type, id] = nouvelleEdr.cible.split(':')
  try {
    await api('/api/harfanglab/entites-edr', { method: 'POST', body: { valeur: nouvelleEdr.valeur.trim(), cible: { type, id } } })
    msgEdr.value = `« ${nouvelleEdr.valeur.trim()} » déclarée : ses agents seront comptés dans l'unité dès qu'ils porteront cette étiquette.`
    nouvelleEdr.valeur = ''
    nouvelleEdr.cible = ''
    await Promise.all([refreshEntitesEdr(), refreshParc()])
  }
  catch (e) { msgEdr.value = messageErreur(e, 'La déclaration n\'a pas été enregistrée.') }
}

const dateFr = (s: string | null) => (s ? new Date(s).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—')

const ouvert = ref<string | null>(null)
const basculer = (id: string) => {
  ouvert.value = ouvert.value === id ? null : id
}

// Les clés de `modes` telles que l'API les rend. Le LIBELLÉ est traduit, jamais la VALEUR :
// la sémantique des entiers n'est documentée nulle part chez l'éditeur.
const LIBELLE_MODE: Record<string, string> = {
  yara: 'YARA',
  sigma: 'Sigma',
  ioc: 'IOC',
  correlation: 'Corrélation',
  driverblock: 'Driver blocklist',
  driverblockStrategie: 'Stratégie driver blocklist',
  rulesetYara: 'Jeu de règles YARA',
  rulesetSigma: 'Jeu de règles Sigma',
  rulesetIoc: 'Jeu de règles IOC',
  rulesetCorrelation: 'Jeu de règles corrélation',
}
const estMode = (k: string) => ['yara', 'sigma', 'ioc', 'correlation', 'driverblock'].includes(k)
const STATUT_TON: Record<string, string> = { ok: 'text-emerald-600', erreur: 'text-red-600', en_cours: 'text-amber-600', jamais: 'text-secondary-400' }

// Le taux d'ambiguïté dit ce que valent tous les autres chiffres.
const fiabilite = computed(() => {
  const c = couverture.value?.comptes
  if (!c || !c.machines) return null
  return Math.round((c.ambigus / c.machines) * 100)
})

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const LIBELLE = 'font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Connecteur HarfangLab
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Lecture seule : agents, couverture du parc critique, moteurs de détection, listes blanches. Aucune écriture n'est faite dans HarfangLab.
      </p>
    </header>

    <section :class="[TUILE, 'space-y-5']">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block">
          <span :class="LIBELLE">URL de HarfangLab</span>
          <input
            v-model="f.url"
            :class="[CHAMP, 'mt-1 w-full']"
            placeholder="https://edr.example.org"
          >
          <span class="mt-1 block text-[11px] text-secondary-400">L'origine seule, sans /api — il est ajouté automatiquement.</span>
        </label>
        <label class="block">
          <span :class="LIBELLE">Jeton d'API</span>
          <input
            v-model="f.jeton"
            type="password"
            :class="[CHAMP, 'mt-1 w-full']"
            :placeholder="config?.jetonDefini ? '•••••••• (défini — laisser vide pour ne pas changer)' : 'Jeton en lecture'"
          >
          <span class="mt-1 block text-[11px] text-secondary-400">Chiffré en base. Un compte en LECTURE suffit.</span>
        </label>
      </div>

      <!-- MARQUEURS DES RÈGLES TECHNIQUES. Une règle ainsi marquée n'a pas d'échéance de revue — c'est une pièce de la configuration de l'EDR, pas une dérogation. -->
      <label class="block">
        <span :class="LIBELLE">Marqueurs des règles techniques</span>
        <input
          v-model="f.marqueursTechniques"
          :class="[CHAMP, 'mt-1 w-full']"
          placeholder="harfanglab_rule"
        >
        <span class="mt-1 block text-[11px] text-secondary-400">
          Séparés par des virgules. Une liste blanche portant l'une de ces étiquettes est une pièce de configuration de l'EDR. Elle reste inventoriée, mais <strong>sans échéance de revue</strong>.
          Sans étiquette déclarée, toutes les règles gardent leur échéance.
        </span>
      </label>

      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-sm text-secondary-700">
          <input
            v-model="f.actif"
            type="checkbox"
            class="size-4 accent-primary-600"
          > Synchronisation automatique active
        </label>
        <label class="flex items-center gap-2 text-sm text-secondary-700">
          <span :class="LIBELLE">Fréquence (heures)</span>
          <input
            v-model.number="f.frequenceHeures"
            type="number"
            min="0"
            :class="[CHAMP, 'w-24']"
          >
        </label>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          :disabled="!!busy"
          @click="enregistrer"
        >
          <Icon
            name="lucide:save"
            class="size-4"
          /> Enregistrer
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-50"
          :disabled="!!busy"
          @click="tester"
        >
          <Icon
            name="lucide:plug-zap"
            class="size-4"
          /> Tester la connexion
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-50"
          :disabled="!!busy"
          @click="synchroniser"
        >
          <Icon
            name="lucide:refresh-cw"
            class="size-4"
            :class="busy === 'sync' ? 'animate-spin' : ''"
          /> Synchroniser maintenant
        </button>
        <span
          v-if="msg"
          class="text-sm"
          :class="msgTon === 'ok' ? 'text-emerald-600' : 'text-red-600'"
        >{{ msg }}</span>
      </div>
    </section>

    <!-- TÉMOIN D'ACTIVITÉ : sans lui, une couverture parfaite et un connecteur mort se
         ressemblent. La date du dernier passage réussi est affichée avec le résultat. -->
    <section
      v-if="config"
      :class="[TUILE, 'flex flex-wrap items-center gap-x-8 gap-y-2 !py-4 text-sm']"
    >
      <span><span :class="LIBELLE">Dernier statut</span> <span
        class="ml-1 font-medium"
        :class="STATUT_TON[config.dernierStatut]"
      >{{ config.dernierStatut }}</span></span>
      <span><span :class="LIBELLE">Le</span> <span class="ml-1 font-mono text-secondary-600">{{ dateFr(config.dernierSyncAt) }}</span></span>
      <span
        v-if="config.dernierMessage"
        class="w-full text-xs text-secondary-500"
      >{{ config.dernierMessage }}</span>
    </section>

    <!-- COUVERTURE DU PARC CRITIQUE -->
    <section :class="[TUILE, 'space-y-4']">
      <div>
        <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
          <Icon
            name="lucide:shield-check"
            class="size-4 text-primary-500"
          />
          Couverture du parc critique
        </h2>
        <p class="mt-1 text-sm text-secondary-500">
          Machines marquées critiques par leur groupe GLPI, confrontées aux agents qui remontent.
        </p>
      </div>

      <p
        v-if="!couverture?.reglesDeclarees"
        class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800"
      >
        <strong>Aucun groupe critique déclaré.</strong> Écart non calculable. Renseignez la correspondance « groupe GLPI → criticité » dans le connecteur GLPI.
      </p>
      <p
        v-else-if="couverture.dernierStatut === 'jamais'"
        class="rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3 text-sm text-secondary-600"
      >
        Aucune synchronisation n'a encore eu lieu. L'écart affiché n'a pas de sens.
      </p>

      <template v-else-if="couverture">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="t in [
              { n: couverture.comptes.machines, label: 'machines critiques GLPI', alerte: false },
              { n: couverture.comptes.certains + couverture.comptes.probables, label: 'critiques avec agent EDR', alerte: false },
              { n: couverture.comptes.machinesSansAgent, label: 'critiques SANS agent EDR', alerte: couverture.comptes.machinesSansAgent > 0 },
              { n: couverture.comptes.ambigus, label: 'rapprochements ambigus', alerte: couverture.comptes.ambigus > 0 },
            ]"
            :key="t.label"
            class="rounded-xl border border-secondary-200/70 p-3"
          >
            <span
              class="block text-xl font-semibold leading-none tracking-tight"
              :class="t.alerte ? 'text-red-700' : 'text-secondary-900'"
            >{{ t.n }}</span>
            <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
          </div>
        </div>

        <!-- LE RESTE DU PARC, et ce que l'EDR voit hors de GLPI. Le parc critique est rapproché
             d'abord (chiffres ci-dessus inchangés), les agents restants ensuite. -->
        <div
          v-if="parc"
          class="space-y-2"
        >
          <p class="text-xs font-semibold text-secondary-700">
            Parc GLPI non critique et agents EDR hors GLPI
          </p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="t in [
                { n: parc.total.nonCritiques, label: 'machines GLPI non critiques', alerte: false },
                { n: parc.total.nonCritiquesAvecAgent, label: 'non critiques avec agent EDR', alerte: false },
                { n: parc.total.nonCritiquesSansAgent, label: 'non critiques sans agent EDR', alerte: false },
                { n: parc.agents.sansMachineGlpi, label: 'agents EDR sans machine GLPI', alerte: parc.agents.sansMachineGlpi > 0 },
              ]"
              :key="t.label"
              class="rounded-xl border border-secondary-200/70 p-3"
            >
              <span
                class="block text-xl font-semibold leading-none tracking-tight"
                :class="t.alerte ? 'text-amber-700' : 'text-secondary-900'"
              >{{ t.n }}</span>
              <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
            </div>
          </div>
          <!-- LA PARTITION, écrite en toutes lettres : chaque agent est dans une seule case. -->
          <p class="text-[11px] text-secondary-500">
            {{ parc.agents.total }} agents EDR au total : {{ parc.agents.liesCritiques }} sur une machine critique GLPI,
            {{ parc.agents.liesNonCritiques }} sur une machine GLPI non critique,
            {{ parc.agents.ambigusCritiques + parc.agents.ambigusNonCritiques }} en rapprochement ambigu,
            {{ parc.agents.sansMachineGlpi }} sans machine GLPI.
          </p>
          <div
            v-if="parc.agentsSansMachineGlpi.length"
            class="space-y-1"
          >
            <p class="text-xs font-semibold text-amber-700">
              Agents EDR sans machine GLPI ({{ parc.agents.sansMachineGlpi }}) — non ventilés : aucune entité GLPI ne les rattache
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="a in parc.agentsSansMachineGlpi.slice(0, 40)"
                :key="a.agentId"
                class="rounded-md border border-secondary-200/60 px-2 py-0.5 font-mono text-[11px] text-secondary-700"
              >{{ a.hostname ?? a.agentId }}</span>
            </div>
            <p
              v-if="parc.agents.sansMachineGlpi > 40"
              class="text-[11px] text-secondary-400"
            >
              40 affichés sur {{ parc.agents.sansMachineGlpi }}.
            </p>
          </div>
        </div>

        <!-- Le chiffre qui dit ce que valent les autres. -->
        <p
          v-if="fiabilite !== null"
          class="rounded-xl border p-3 text-xs"
          :class="fiabilite > 5 ? 'border-amber-200 bg-amber-50/60 text-amber-800' : 'border-secondary-200/70 bg-secondary-50/40 text-secondary-600'"
        >
          <strong>{{ fiabilite }} % de rapprochements ambigus.</strong>
          Ce taux conditionne la fiabilité des autres chiffres : au-delà de quelques pour cent, l'écart
          affiché doit être interprété avec réserve. {{ couverture.comptes.machinesSansSerieUtilisable }} machine(s) et
          {{ couverture.comptes.agentsSansSerieUtilisable }} agent(s) n'ont pas de numéro de série exploitable —
          leur rapprochement repose alors sur le seul nom d'hôte.
        </p>

        <div
          v-if="couverture.sansAgent.length"
          class="space-y-1"
        >
          <p class="text-xs font-semibold text-red-700">
            Machines critiques sans agent ({{ couverture.comptes.machinesSansAgent }})
          </p>
          <div
            v-for="m in couverture.sansAgent.slice(0, 25)"
            :key="m.glpiId"
            class="flex flex-wrap items-baseline gap-2 rounded-lg border border-secondary-200/60 px-3 py-1.5 text-[11px]"
          >
            <span class="font-mono text-secondary-800">{{ m.nom ?? m.glpiId }}</span>
            <span
              v-if="m.entite"
              class="text-secondary-400"
            >· {{ m.entite }}</span>
          </div>
          <p
            v-if="couverture.comptes.machinesSansAgent > 25"
            class="text-[11px] text-secondary-400"
          >
            25 affichées sur {{ couverture.comptes.machinesSansAgent }}.
          </p>
        </div>

        <div
          v-if="couverture.ambigus.length"
          class="space-y-1"
        >
          <p class="text-xs font-semibold text-amber-700">
            Rapprochements ambigus — non tranchés ({{ couverture.comptes.ambigus }})
          </p>
          <div
            v-for="(a, i) in couverture.ambigus.slice(0, 15)"
            :key="i"
            class="rounded-lg border border-secondary-200/60 px-3 py-1.5 text-[11px]"
          >
            <span class="font-mono text-secondary-800">{{ a.machine.nom ?? a.machine.glpiId }}</span>
            <span class="ml-2 text-secondary-500">{{ a.motif }}</span>
          </div>
        </div>
      </template>
    </section>

    <!-- RATTACHEMENT DES ENTITÉS EDR -->
    <section
      v-if="entitesEdr"
      :class="[TUILE, 'space-y-4']"
    >
      <div>
        <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
          <Icon
            name="lucide:git-branch-plus"
            class="size-4 text-primary-500"
          />
          Rattachement des entités EDR
        </h2>
        <p class="mt-1 text-sm text-secondary-500">
          L'entité saisie dans HarfangLab (information additionnelle 1) place dans une unité les agents qui n'ont pas de machine
          GLPI. Rattachement automatique quand le nom correspond exactement à une seule unité ; sinon, choisissez l'unité. Les
          agents rapprochés d'une machine GLPI gardent l'unité de GLPI.
        </p>
      </div>
      <p class="text-xs text-secondary-500">
        {{ entitesEdr.agents }} agents, {{ entitesEdr.valeurs.length }} entités distinctes, {{ entitesEdr.sansEntite }} agent(s) sans entité.
      </p>
      <p
        v-if="msgEdr"
        class="text-sm text-secondary-700"
      >
        {{ msgEdr }}
      </p>
      <div class="flex flex-wrap items-end gap-2 rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3">
        <label class="block">
          <span class="mb-1 block text-[11px] text-secondary-500">Étiquette pas encore posée dans HarfangLab</span>
          <input
            v-model="nouvelleEdr.valeur"
            placeholder="ex. InfraDev"
            class="w-48 rounded-lg border border-secondary-200 px-2 py-1.5 font-mono text-sm"
          >
        </label>
        <select
          v-model="nouvelleEdr.cible"
          class="max-w-80 rounded-lg border border-secondary-200 px-2 py-1.5 text-sm"
        >
          <option value="">
            Unité…
          </option>
          <optgroup
            v-for="g in unitesEdr"
            :key="g.type"
            :label="g.groupe"
          >
            <option
              v-for="o in g.liste"
              :key="o.id"
              :value="`${g.type}:${o.id}`"
            >
              {{ o.libelle }}
            </option>
          </optgroup>
        </select>
        <button
          class="rounded-lg border border-secondary-200 bg-white px-2.5 py-1.5 text-xs text-secondary-700 hover:bg-secondary-50 disabled:opacity-50"
          :disabled="!nouvelleEdr.valeur.trim() || !nouvelleEdr.cible"
          @click="declarerAVenir"
        >
          Déclarer d'avance
        </button>
        <span class="w-full text-[11px] text-secondary-500">
          La casse et la ponctuation ne comptent pas : « InfraDev » reconnaîtra « INFRA_DEV ». Plusieurs étiquettes peuvent aller vers la même unité, leurs agents s'additionnent.
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] text-secondary-500">
              <th class="py-1 pr-3 font-medium">
                Entité EDR
              </th>
              <th class="py-1 pr-3 text-right font-medium">
                Agents
              </th>
              <th class="py-1 pr-3 font-medium">
                Rattachement
              </th>
              <th class="py-1 font-medium">
                Unité
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in entitesEdr.valeurs"
              :key="v.valeur"
              class="border-t border-secondary-100 align-top"
            >
              <td class="py-2 pr-3 font-mono text-xs text-secondary-800">
                {{ v.valeur }}
                <span
                  v-if="v.attendue"
                  class="mt-0.5 block font-sans text-[11px] text-secondary-400"
                >pas encore vue dans HarfangLab</span>
              </td>
              <td class="py-2 pr-3 text-right tabular-nums">
                {{ v.agents }}
              </td>
              <td class="py-2 pr-3">
                <Pill :tone="ETAT_EDR[v.motif]?.t ?? 'gray'">
                  {{ ETAT_EDR[v.motif]?.l ?? v.motif }}
                </Pill>
                <span
                  v-if="v.libelle"
                  class="mt-1 block text-xs text-secondary-600"
                >{{ v.libelle }}</span>
              </td>
              <td class="py-2">
                <div class="flex flex-wrap items-center gap-2">
                  <select
                    v-model="choixEdr[v.valeur]"
                    class="max-w-80 rounded-lg border border-secondary-200 px-2 py-1.5 text-sm"
                  >
                    <option value="">
                      Choisir une unité…
                    </option>
                    <!-- Sans composante : là où GLPI range les machines laissées à la racine, comme
                         celles des services centraux. -->
                    <optgroup label="Établissement, sans composante">
                      <option
                        v-for="o in entitesEdr.options.etablissements"
                        :key="o.id"
                        :value="`etablissement:${o.id}`"
                      >
                        {{ o.libelle }}
                      </option>
                    </optgroup>
                    <optgroup label="Composantes">
                      <option
                        v-for="o in entitesEdr.options.composantes"
                        :key="o.id"
                        :value="`composante:${o.id}`"
                      >
                        {{ o.libelle }}
                      </option>
                    </optgroup>
                    <optgroup label="Services">
                      <option
                        v-for="o in entitesEdr.options.services"
                        :key="o.id"
                        :value="`service:${o.id}`"
                      >
                        {{ o.libelle }}
                      </option>
                    </optgroup>
                    <optgroup label="Départements">
                      <option
                        v-for="o in entitesEdr.options.departements"
                        :key="o.id"
                        :value="`departement:${o.id}`"
                      >
                        {{ o.libelle }}
                      </option>
                    </optgroup>
                    <optgroup label="Pôles">
                      <option
                        v-for="o in entitesEdr.options.poles"
                        :key="o.id"
                        :value="`pole:${o.id}`"
                      >
                        {{ o.libelle }}
                      </option>
                    </optgroup>
                  </select>
                  <button
                    class="rounded-lg border border-secondary-200 px-2.5 py-1.5 text-xs text-secondary-700 hover:bg-secondary-50 disabled:opacity-50"
                    :disabled="!choixEdr[v.valeur]"
                    @click="rattacherEdr(v)"
                  >
                    Enregistrer
                  </button>
                  <button
                    v-if="v.source === 'declaree'"
                    class="rounded-lg px-2 py-1.5 text-xs text-secondary-500 hover:bg-secondary-50"
                    @click="rattacherEdr(v, true)"
                  >
                    Revenir à l'automatique
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ÉTAT DES MOTEURS -->
    <section :class="[TUILE, 'space-y-4']">
      <div>
        <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
          <Icon
            name="lucide:radar"
            class="size-4 text-primary-500"
          />
          Moteurs de détection, par politique
        </h2>
        <p class="mt-1 text-sm text-secondary-500">
          La désactivation d'un moteur ne produit aucune erreur. Chaque synchronisation compare l'état relevé au précédent et signale les changements.
        </p>
        <p class="mt-1 text-xs text-secondary-500">
          <Icon
            name="lucide:info"
            class="mr-1 inline size-3.5 align-[-2px] text-secondary-400"
          />
          Les valeurs affichées sont celles de l'API, telles quelles. <strong>Leur signification n'est
            documentée nulle part chez l'éditeur</strong> : rien n'indique que 0 signifie « désactivé ». Les changements sont signalés, non traduits.
        </p>
      </div>

      <p
        v-if="!moteurs?.length"
        class="rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3 text-sm text-secondary-500"
      >
        Aucun relevé pour l'instant.
      </p>

      <div
        v-for="m in moteurs ?? []"
        :key="m.politiqueId"
        class="rounded-xl border p-3"
        :class="m.changements?.length ? 'border-red-200 bg-red-50/40' : 'border-secondary-200/60'"
      >
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="flex items-center gap-1.5 text-left"
            :aria-expanded="ouvert === m.politiqueId"
            @click="basculer(m.politiqueId)"
          >
            <Icon
              :name="ouvert === m.politiqueId ? 'lucide:chevron-down' : 'lucide:chevron-right'"
              class="size-4 shrink-0 text-secondary-400"
            />
            <span class="font-medium tracking-tight text-secondary-900">{{ m.politiqueNom ?? m.politiqueId }}</span>
          </button>
          <Pill
            v-if="m.changements?.length"
            tone="red"
          >
            {{ m.changements.length }} changement(s)
          </Pill>
          <Pill
            v-else-if="m.changements === null"
            tone="gray"
            title="Premier relevé : il n'y a rien à comparer. À distinguer d'un « rien n'a changé »."
          >
            Premier relevé
          </Pill>
          <span class="ml-auto font-mono text-[10px] text-secondary-400">{{ dateFr(m.releveLe) }}</span>
        </div>

        <div
          v-if="m.changements?.length"
          class="mt-2 space-y-0.5"
        >
          <p
            v-for="(c, i) in m.changements"
            :key="i"
            class="font-mono text-[11px] text-red-800"
          >
            {{ c.champ }} : {{ JSON.stringify(c.avant) }} → {{ JSON.stringify(c.apres) }}
          </p>
        </div>

        <!-- FICHE. L'état relevé, lisible, sans traduction des valeurs. -->
        <div
          v-if="ouvert === m.politiqueId"
          class="mt-3 space-y-3 border-t border-secondary-200/60 pt-3"
        >
          <div v-if="m.modes">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
              État relevé
            </p>
            <dl class="mt-1.5 grid grid-cols-1 gap-x-8 gap-y-1 text-[11px] sm:grid-cols-2">
              <div
                v-for="(v, k) in m.modes"
                :key="k"
                class="flex items-baseline justify-between gap-3 border-b border-secondary-100 py-0.5"
              >
                <dt class="text-secondary-500">
                  {{ LIBELLE_MODE[k] ?? k }}
                </dt>
                <dd class="break-all font-mono text-secondary-800">
                  {{ v === null ? 'non renseigné' : v }}<template v-if="estMode(String(k))">
                    <span class="ml-1 text-secondary-400">(valeur brute)</span>
                  </template>
                </dd>
              </div>
            </dl>
          </div>

          <div v-if="m.revisions && Object.keys(m.revisions).length">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
              Révisions chargées
            </p>
            <dl class="mt-1.5 grid grid-cols-2 gap-x-8 gap-y-1 text-[11px] sm:grid-cols-4">
              <div
                v-for="(v, k) in m.revisions"
                :key="k"
                class="flex items-baseline justify-between gap-2 border-b border-secondary-100 py-0.5"
              >
                <dt class="text-secondary-500">
                  {{ k }}
                </dt>
                <dd class="font-mono text-secondary-800">
                  {{ v ?? '—' }}
                </dd>
              </div>
            </dl>
          </div>

          <div class="rounded-lg border border-secondary-200/70 bg-secondary-50/50 px-3 py-2">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
              Modification
            </p>
            <p class="mt-1 text-[11px] text-secondary-700">
              <strong>HarfangLab, console de l'éditeur</strong> — moteurs et jeux de règles rattachés à la politique. Le Catalogue relève cet état et signale ses changements. Il n'écrit pas dans l'EDR.
            </p>
          </div>

          <p class="text-[11px] text-secondary-500">
            L'éditeur ne documente pas la signification de ces valeurs. Elles sont restituées telles quelles. Seuls les changements d'une synchronisation à l'autre sont
            exploitables.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
