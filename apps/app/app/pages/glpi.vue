<script setup lang="ts">
// Connecteur GLPI (admin) : configuration, test de connexion, synchronisation manuelle, et file
// « à classer » — la distinction serveur/poste que GLPI ne fait pas et que, faute de convention
// de nommage, on tranche à la main quand l'OS ne suffit pas.

const api = useApi()
const perms = await usePermissions()
if (!perms.isAdmin.value) throw createError({ statusCode: 403, statusMessage: 'Réservé aux administrateurs' })

type Criticite = 'vitale' | 'critique' | 'essentielle' | 'importante' | 'secondaire'
type RegleCriticite = { groupe: string, criticite: Criticite }

type Config = {
  url: string | null
  actif: boolean
  frequenceHeures: number
  dernierSyncAt: string | null
  dernierStatut: string
  dernierMessage: string | null
  dernierComptes: { total: number, serveurs: number, postes: number, mobiles?: number, iot?: number, aClasser: number, ignores: number, criticites?: number, conflitsNom?: number, echecs?: number, doublons?: number, fiches?: number } | null
  appTokenDefini: boolean
  userTokenDefini: boolean
  groupesCriticite: RegleCriticite[] | null
}
type Machine = { id: string, glpiId: string, nom: string, type: string | null, os: string | null, osVersion: string | null, entite: string | null, groupe: string | null, groupeTechnique: string | null, classement: string, classementManuel: boolean, cibleId: string | null }

const { data: config, refresh: refreshConfig } = await useAsyncData('glpi-config', () => api<Config>('/api/glpi/config'), { getCachedData: () => undefined })
const { data: compteurs, refresh: refreshCompteurs } = await useAsyncData('glpi-compteurs', () => api<Record<string, number>>('/api/glpi/machines/compteurs'), { getCachedData: () => undefined })

const f = reactive({ url: '', appToken: '', userToken: '', actif: false, frequenceHeures: 24 })
watchEffect(() => {
  if (config.value) {
    f.url = config.value.url ?? ''
    f.actif = config.value.actif
    f.frequenceHeures = config.value.frequenceHeures
  }
})

// --- Correspondance « groupe GLPI → criticité » --------------------------------------
// GLPI n'attache aucun sens à ses groupes : c'est l'établissement qui en donne un (ici, le
// groupe sert à marquer les machines critiques).
const CRITICITES: { value: Criticite, label: string }[] = [
  { value: 'vitale', label: 'Vitale' },
  // « Critique » sans niveau : à employer quand le groupe GLPI dit seulement « critique »
  // et qu'on ne veut pas inventer la nuance entre vitale et essentielle.
  { value: 'critique', label: 'Critique' },
  { value: 'essentielle', label: 'Essentielle' },
  { value: 'importante', label: 'Importante' },
  { value: 'secondaire', label: 'Secondaire' },
]
const regles = ref<RegleCriticite[]>([])
watchEffect(() => {
  regles.value = (config.value?.groupesCriticite ?? []).map(r => ({ ...r }))
})

const { data: groupesVus } = await useAsyncData(
  'glpi-groupes',
  () => api<{ groupe: string, machines: number, machinesSousArbre: number }[]>('/api/glpi/groupes'),
  { getCachedData: () => undefined },
)
// Groupes encore disponibles : on ne propose pas deux fois le même.
const groupesLibres = computed(() => {
  const pris = new Set(regles.value.map(r => r.groupe))
  return (groupesVus.value ?? []).filter(g => !pris.has(g.groupe))
})
// C'est le total SOUS-ARBRE qui compte : c'est le nombre de machines que la règle marquera
// réellement.
const machinesDuGroupe = (nom: string) => (groupesVus.value ?? []).find(g => g.groupe === nom)?.machinesSousArbre ?? null

// --- Doublons d'inventaire ------------------------------------------------------------
// Deux entrées qui partagent un numéro de série sont la même machine : une preuve.
type Doublon = { cle: string, machines: { glpiId: string, nom: string, entite: string | null, numeroSerie: string | null, classement: string }[] }
type Doublons = {
  certains: Doublon[]
  probables: Doublon[]
  resume: { machines: number, entreesCertaines: number, entreesProbables: number, sansSerie: number }
}
const { data: doublons, refresh: refreshDoublons } = await useAsyncData(
  'glpi-doublons',
  () => api<Doublons>('/api/glpi/doublons'),
  { getCachedData: () => undefined },
)
const voirDoublons = ref(false)

const ajouterRegle = (groupe = '') => regles.value.push({ groupe, criticite: 'vitale' })
const retirerRegle = (i: number) => regles.value.splice(i, 1)

const msg = ref('')
const msgTon = ref<'ok' | 'err' | ''>('')
const busy = ref('')

const enregistrer = async () => {
  busy.value = 'save'
  msg.value = ''
  try {
    // Les lignes sans groupe choisi sont écartées ici : ajouter une ligne puis
    // l'abandonner est le geste le plus courant, il ne doit rien enregistrer.
    await api('/api/glpi/config', {
      method: 'PUT',
      body: { ...f, groupesCriticite: regles.value.filter(r => r.groupe.trim()) },
    })
    f.appToken = '' // vidés : ne restent pas à l'écran
    f.userToken = ''
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
    const r = await api<{ ok: boolean, message: string }>('/api/glpi/test', { method: 'POST', body: { url: f.url, appToken: f.appToken, userToken: f.userToken } })
    msg.value = r.message
    msgTon.value = r.ok ? 'ok' : 'err'
  }
  catch {
    msg.value = 'Test impossible.'
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}
const synchroniser = async () => {
  busy.value = 'sync'
  msg.value = ''
  try {
    const r = await api<{ ok: boolean, compteurs?: Record<string, number>, message?: string }>('/api/glpi/sync', { method: 'POST' })
    if (r.ok && r.compteurs) {
      msg.value = `Sync réussie : ${r.compteurs.total} machine(s).`
      msgTon.value = 'ok'
    }
    else {
      msg.value = r.message ?? 'Échec de la synchronisation.'
      msgTon.value = 'err'
    }
    await Promise.all([refreshConfig(), refreshCompteurs(), refreshMachines(), refreshDoublons()])
  }
  catch (e: unknown) {
    msg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Échec de la synchronisation.'
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}

// File à classer + onglets par classement.
const ONGLETS = [
  { k: 'a_classer', label: 'À classer', icone: 'lucide:help-circle' },
  { k: 'serveur', label: 'Serveurs', icone: 'lucide:server' },
  { k: 'poste', label: 'Postes', icone: 'lucide:monitor' },
  { k: 'appareil_mobile', label: 'Mobiles', icone: 'lucide:tablet-smartphone' },
  { k: 'iot', label: 'IoT', icone: 'lucide:cctv' },
  { k: 'ignore', label: 'Ignorées', icone: 'lucide:circle-slash' },
]
// Libellés courts des cibles de reclassement.
const CLASSEMENTS: Record<string, string> = { serveur: '→ Serveur', poste: '→ Poste', appareil_mobile: '→ Mobile', iot: '→ IoT', ignore: '→ Ignorer', a_classer: '→ À classer' }
const onglet = ref('a_classer')
const { data: machines, refresh: refreshMachines } = await useAsyncData(
  'glpi-machines',
  () => api<Machine[]>(`/api/glpi/machines?classement=${onglet.value}`),
  { getCachedData: () => undefined, watch: [onglet] },
)

const reclasser = async (m: Machine, classement: string) => {
  await api(`/api/glpi/machines/${m.id}`, { method: 'PATCH', body: { classement } })
  await Promise.all([refreshMachines(), refreshCompteurs()])
}

const dateFr = (s: string | null) => s ? new Date(s).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—'
const STATUT_TONE: Record<string, string> = { ok: 'text-emerald-600', erreur: 'text-red-600', en_cours: 'text-amber-600', jamais: 'text-secondary-400' }

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const LIBELLE = 'font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Connecteur GLPI
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Import en lecture seule de l'inventaire. Serveurs, postes, appareils mobiles et IoT sont distingués par type de châssis et OS ; l'ambigu part en file « à classer ». La composante est dérivée de l'entité GLPI.
      </p>
    </header>

    <!-- Configuration -->
    <section :class="[TUILE, 'space-y-5']">
      <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        <Icon
          name="lucide:plug"
          class="size-4 text-primary-500"
        /> Connexion
      </h2>
      <div class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 sm:col-span-2">
          <span :class="LIBELLE">URL de GLPI</span>
          <input
            v-model="f.url"
            :class="CHAMP"
            placeholder="https://glpi.example.org"
          >
        </label>
        <label class="flex flex-col gap-1.5">
          <span :class="LIBELLE">App-Token {{ config?.appTokenDefini ? '(défini)' : '' }}</span>
          <input
            v-model="f.appToken"
            type="password"
            :class="CHAMP"
            :placeholder="config?.appTokenDefini ? '•••••• (laisser vide = inchangé)' : 'Jeton d\'API applicatif'"
          >
        </label>
        <label class="flex flex-col gap-1.5">
          <span :class="LIBELLE">User-Token {{ config?.userTokenDefini ? '(défini)' : '' }}</span>
          <input
            v-model="f.userToken"
            type="password"
            :class="CHAMP"
            :placeholder="config?.userTokenDefini ? '•••••• (laisser vide = inchangé)' : 'Jeton du compte dédié'"
          >
        </label>
        <label class="flex items-center gap-2 text-sm text-secondary-700">
          <input
            v-model="f.actif"
            type="checkbox"
            class="size-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500/30"
          >
          Synchronisation automatique active
        </label>
        <label class="flex flex-col gap-1.5">
          <span :class="LIBELLE">Fréquence (heures, 0 = manuel)</span>
          <input
            v-model.number="f.frequenceHeures"
            type="number"
            min="0"
            :class="CHAMP"
          >
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button
          :disabled="busy === 'save'"
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          @click="enregistrer"
        >
          <Icon
            :name="busy === 'save' ? 'lucide:loader-circle' : 'lucide:save'"
            class="size-4"
            :class="busy === 'save' ? 'animate-spin' : ''"
          /> Enregistrer
        </button>
        <button
          :disabled="busy === 'test'"
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-4 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-50"
          @click="tester"
        >
          <Icon
            :name="busy === 'test' ? 'lucide:loader-circle' : 'lucide:plug-zap'"
            class="size-4"
            :class="busy === 'test' ? 'animate-spin' : ''"
          /> Tester la connexion
        </button>
        <button
          :disabled="busy === 'sync'"
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          @click="synchroniser"
        >
          <Icon
            :name="busy === 'sync' ? 'lucide:loader-circle' : 'lucide:refresh-cw'"
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

    <!-- Correspondance « groupe GLPI → criticité ». Elle vit ici, à côté du connecteur, parce qu'elle décrit une convention de L'INSTANCE GLPI et non une règle de l'application. -->
    <section :class="[TUILE, 'space-y-4']">
      <div>
        <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
          <Icon
            name="lucide:shield-alert"
            class="size-4 text-primary-500"
          />
          Criticité portée par les groupes GLPI
        </h2>
        <p class="mt-1 text-sm text-secondary-500">
          GLPI n'attache aucun sens à ses groupes. Déclarez ici ceux qui <strong>désignent des machines critiques</strong> — la synchronisation posera la criticité
          correspondante sur les serveurs, postes, mobiles et objets connectés concernés.
        </p>
        <p class="mt-1 text-sm text-secondary-500">
          Déclarer un groupe couvre <strong>tout son sous-arbre</strong> : une règle sur « critique »
          marque aussi « critique&nbsp;&gt;&nbsp;Niveau&nbsp;1&nbsp;&gt;&nbsp;Applicatif ». Pour traiter une
          branche autrement, déclarez-la à part — <strong>la règle la plus précise l'emporte</strong>.
        </p>
      </div>

      <p
        v-if="!groupesVus?.length"
        class="rounded-xl border border-secondary-200/70 bg-secondary-50/40 px-3 py-2 text-xs text-secondary-500"
      >
        Aucun groupe relevé dans l'inventaire. Après une synchronisation, les groupes rencontrés apparaissent ici et se choisissent dans une liste plutôt que de les recopier.
      </p>

      <div
        v-for="(r, i) in regles"
        :key="i"
        class="flex flex-wrap items-center gap-2"
      >
        <select
          v-model="r.groupe"
          :class="[CHAMP, 'min-w-56 flex-1']"
        >
          <option value="">
            — choisir un groupe GLPI —
          </option>
          <!-- Le groupe déjà retenu reste proposé, sinon la ligne se viderait à l'affichage. -->
          <option
            v-if="r.groupe && !groupesLibres.some(g => g.groupe === r.groupe)"
            :value="r.groupe"
          >
            {{ r.groupe }}{{ machinesDuGroupe(r.groupe) ? ` (${machinesDuGroupe(r.groupe)} machines)` : ' — absent de l\'inventaire' }}
          </option>
          <option
            v-for="g in groupesLibres"
            :key="g.groupe"
            :value="g.groupe"
          >
            {{ g.groupe }} — {{ g.machinesSousArbre }} machine(s){{ g.machinesSousArbre !== g.machines ? ` dont ${g.machines} en direct` : '' }}
          </option>
        </select>
        <Icon
          name="lucide:arrow-right"
          class="size-4 shrink-0 text-secondary-300"
        />
        <select
          v-model="r.criticite"
          :class="[CHAMP, 'w-40']"
        >
          <option
            v-for="c in CRITICITES"
            :key="c.value"
            :value="c.value"
          >
            {{ c.label }}
          </option>
        </select>
        <button
          class="rounded-lg border border-secondary-200 px-2 py-2 text-secondary-400 transition-colors hover:border-red-300 hover:text-red-600"
          title="Retirer cette règle"
          @click="retirerRegle(i)"
        >
          <Icon
            name="lucide:trash-2"
            class="size-4"
          />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
          @click="ajouterRegle()"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Ajouter une règle
        </button>
        <span
          v-if="regles.length"
          class="text-xs text-secondary-400"
        >Enregistrez pour appliquer à la prochaine synchronisation.</span>
      </div>

      <!-- Ce que la règle NE FAIT PAS. Sans cette phrase, on croirait le marquage
           réversible — et on découvrirait le contraire au pire moment. -->
      <p class="text-xs text-secondary-500">
        <Icon
          name="lucide:info"
          class="mr-1 inline size-3.5 align-[-2px] text-secondary-400"
        />
        Une machine qui <strong>sort</strong> du groupe n'est jamais déclassée automatiquement. Une criticité ne baisse que sur décision humaine, faute de quoi la perte ne se remarque qu'au moment où elle compte.
        Le retrait se fait à la main, sur la fiche.
      </p>
    </section>

    <!-- Dernier run -->
    <section
      v-if="config"
      :class="[TUILE, 'flex flex-wrap items-center gap-x-8 gap-y-2 text-sm']"
    >
      <span><span :class="LIBELLE">Dernier statut</span> <span
        class="ml-1 font-medium"
        :class="STATUT_TONE[config.dernierStatut]"
      >{{ config.dernierStatut }}</span></span>
      <span><span :class="LIBELLE">Le</span> <span class="ml-1 font-mono text-secondary-600">{{ dateFr(config.dernierSyncAt) }}</span></span>
      <span
        v-if="config.dernierComptes"
        class="font-mono text-xs text-secondary-500"
      >
        {{ config.dernierComptes.total }} machines · {{ config.dernierComptes.serveurs }} serveurs · {{ config.dernierComptes.postes }} postes · {{ config.dernierComptes.mobiles ?? 0 }} mobiles · {{ config.dernierComptes.iot ?? 0 }} IoT · {{ config.dernierComptes.aClasser }} à classer
      </span>
      <!-- Ce qui a mal tourné se lit à part, en rouge : noyé dans la ligne de comptes,
           un échec passerait pour un chiffre parmi d'autres. -->
      <!-- ÉCART entre l'inventaire et le catalogue. Il était absorbé en silence :
           personne n'aurait vu s'il passait de 219 à 500. -->
      <span
        v-if="config.dernierComptes?.doublons"
        class="w-full text-xs text-amber-700"
      >
        <Icon
          name="lucide:copy"
          class="mr-1 inline size-3.5 align-[-2px]"
        />
        {{ config.dernierComptes.doublons }} entrée(s) GLPI en doublon derrière {{ config.dernierComptes.fiches }} fiche(s) —
        <button
          class="underline underline-offset-2 hover:text-amber-900"
          @click="voirDoublons = !voirDoublons"
        >{{ voirDoublons ? 'masquer' : 'voir lesquelles' }}</button>
      </span>
      <span
        v-if="config.dernierComptes?.echecs || config.dernierComptes?.conflitsNom"
        class="w-full text-xs font-medium text-red-700"
      >
        <Icon
          name="lucide:triangle-alert"
          class="mr-1 inline size-3.5 align-[-2px]"
        />
        <template v-if="config.dernierComptes?.echecs">{{ config.dernierComptes.echecs }} machine(s) en échec (journaux du serveur)</template>
        <template v-if="config.dernierComptes?.echecs && config.dernierComptes?.conflitsNom"> · </template>
        <template v-if="config.dernierComptes?.conflitsNom">{{ config.dernierComptes.conflitsNom }} nom(s) déjà pris : renommage non appliqué, à arbitrer</template>
      </span>
      <span
        v-if="config.dernierMessage"
        class="w-full text-xs text-secondary-500"
      >{{ config.dernierMessage }}</span>
    </section>

    <!-- Liste de purge : ce qu'il y a à corriger DANS GLPI, pas dans le Catalogue. -->
    <section
      v-if="voirDoublons && doublons"
      :class="[TUILE, 'space-y-4']"
    >
      <div>
        <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
          <Icon
            name="lucide:copy"
            class="size-4 text-amber-500"
          />
          Doublons d'inventaire
        </h2>
        <p class="mt-1 text-sm text-secondary-500">
          Le Catalogue tient <strong>une fiche par machine</strong>. Plusieurs entrées GLPI désignant le même matériel se rangent derrière la même fiche. Restent dans GLPI des entrées à purger.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          v-for="t in [
            { n: doublons.resume.entreesCertaines, label: 'certains', aide: 'même numéro de série' },
            { n: doublons.resume.entreesProbables, label: 'probables', aide: 'même nom seulement' },
            { n: doublons.resume.sansSerie, label: 'sans n° de série', aide: 'indécidable en l\'état' },
            { n: doublons.resume.machines, label: 'machines GLPI', aide: 'inventaire complet' },
          ]"
          :key="t.label"
          class="rounded-xl border border-secondary-200/70 p-3"
        >
          <span class="block text-lg font-semibold leading-none tracking-tight text-secondary-900">{{ t.n }}</span>
          <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
          <span class="block text-[10px] text-secondary-400">{{ t.aide }}</span>
        </div>
      </div>

      <div
        v-for="groupe in [
          { titre: 'Doublons certains — même numéro de série', liste: doublons.certains, ton: 'text-red-700', aide: 'Deux entrées qui partagent un numéro de série sont la même machine physique. Sans discussion possible.' },
          { titre: 'Doublons probables — même nom', liste: doublons.probables, ton: 'text-amber-700', aide: 'Même nom, numéros de série différents ou absents : à vérifier avant toute suppression.' },
        ]"
        :key="groupe.titre"
        class="space-y-2"
      >
        <template v-if="groupe.liste.length">
          <p
            class="text-xs font-semibold"
            :class="groupe.ton"
          >
            {{ groupe.titre }} ({{ groupe.liste.length }})
          </p>
          <p class="text-[11px] text-secondary-500">
            {{ groupe.aide }}
          </p>
          <div
            v-for="d in groupe.liste.slice(0, 15)"
            :key="d.cle"
            class="rounded-lg border border-secondary-200/60 px-3 py-2"
          >
            <p class="font-mono text-[11px] font-semibold text-secondary-600">
              {{ d.cle }}
            </p>
            <p
              v-for="m in d.machines"
              :key="m.glpiId"
              class="mt-0.5 flex flex-wrap items-baseline gap-2 text-[11px] text-secondary-500"
            >
              <span class="font-mono text-secondary-700">{{ m.nom }}</span>
              <span class="font-mono text-secondary-400">GLPI {{ m.glpiId }}</span>
              <span v-if="m.entite">· {{ m.entite }}</span>
              <span
                v-if="m.classement === 'a_classer'"
                class="rounded border border-amber-200 bg-amber-50 px-1 text-[10px] text-amber-700"
              >à classer</span>
            </p>
          </div>
          <p
            v-if="groupe.liste.length > 15"
            class="text-[11px] text-secondary-400"
          >
            15 groupes affichés sur {{ groupe.liste.length }}.
          </p>
        </template>
      </div>

      <p
        v-if="!doublons.certains.length && !doublons.probables.length"
        class="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-800"
      >
        Aucun doublon détecté dans l'inventaire.
      </p>
    </section>

    <!-- File à classer -->
    <section :class="[TUILE, 'space-y-4']">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="o in ONGLETS"
          :key="o.k"
          class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
          :class="onglet === o.k ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-secondary-200/80 text-secondary-600 hover:bg-secondary-50'"
          @click="onglet = o.k"
        >
          <Icon
            :name="o.icone"
            class="size-4"
          />{{ o.label }}
          <span
            class="font-mono text-[11px] font-semibold"
            :class="o.k === 'a_classer' && compteurs?.a_classer ? 'text-amber-600' : 'text-secondary-400'"
          >{{ compteurs?.[o.k] ?? 0 }}</span>
        </button>
      </div>

      <p
        v-if="!machines?.length"
        class="py-6 text-center text-sm text-secondary-400"
      >
        Aucune machine dans cette catégorie.
      </p>
      <div
        v-else
        class="space-y-1"
      >
        <div
          v-for="m in machines"
          :key="m.id"
          class="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-secondary-50"
        >
          <Icon
            name="lucide:hard-drive"
            class="size-4 shrink-0 text-secondary-400"
          />
          <span class="text-sm font-medium text-secondary-800">{{ m.nom }}</span>
          <span
            v-if="m.type"
            class="inline-flex items-center rounded border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] font-medium text-secondary-500"
            :title="'Type GLPI : ' + m.type"
          >{{ m.type }}</span>
          <span
            v-if="m.os"
            class="font-mono text-[10px] uppercase tracking-wide text-secondary-400"
          >{{ m.os }}{{ m.osVersion ? ' ' + m.osVersion : '' }}</span>
          <span
            v-if="m.entite"
            class="font-mono text-[10px] tracking-wide text-secondary-400"
            :title="'Entité GLPI : ' + m.entite"
          >· {{ m.entite }}</span>
          <!-- Les deux groupes GLPI, avec LEURS libellés d'origine et dans l'ordre de GLPI. -->
          <span
            v-if="m.groupe"
            class="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
            :title="'Groupe (GLPI) : ' + m.groupe"
          >
            <Icon
              name="lucide:users"
              class="size-3"
            />{{ m.groupe }}
          </span>
          <span
            v-if="m.groupeTechnique && m.groupeTechnique !== m.groupe"
            class="inline-flex items-center gap-1 rounded border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] font-medium text-secondary-600"
            :title="'Groupe technique (GLPI) : ' + m.groupeTechnique"
          >
            <Icon
              name="lucide:wrench"
              class="size-3"
            />{{ m.groupeTechnique }}
          </span>
          <span
            v-if="m.classementManuel"
            class="inline-flex items-center rounded border border-primary-200/60 bg-primary-50/60 px-1.5 py-0.5 text-[10px] font-medium text-primary-700"
            title="Classé manuellement"
          >manuel</span>
          <span class="ml-auto flex flex-wrap items-center gap-1">
            <button
              v-for="c in (['serveur', 'poste', 'appareil_mobile', 'iot', 'ignore', 'a_classer'] as const).filter(c => c !== m.classement)"
              :key="c"
              class="rounded-md border border-secondary-200/80 px-2 py-1 text-[11px] text-secondary-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
              @click="reclasser(m, c)"
            >{{ CLASSEMENTS[c] }}</button>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>
