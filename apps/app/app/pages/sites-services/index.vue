<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
import CatalogueFilterBar from '~/components/catalogue/CatalogueFilterBar.vue'
// SITES ET SERVICES — la liste, et l'état d'ensemble. L'objet est le SERVICE EXPOSÉ, pas le
// site web : le modèle porte hôte et port, et un LDAPS sur 636 est un service qui porte un
// certificat sans porter de technologie web.

type Etat = {
  total: number
  jamaisScanne: number
  sansApplication: number
  parType: Record<string, number>
  parEtatMiseAJour: Record<string, number>
  parStatutSupport: Record<string, number>
  sansSupportConnu: number
  enTetes: { hsts: number, csp: number, xFrameOptions: number, referrerPolicy: number, jamaisReleves: number }
  avertissement: string | null
}
type Service = {
  id: string
  hote: string
  port: number
  libelle: string | null
  type: string
  dernierScanAt: string | null
  miseAJour: { etat: string, surTechnologies: number, verifiees: number, partiel: boolean }
  support: string | null
  certificat: string
  technologiePrincipale: { produit: string, version: string | null } | null
  technologies: string[]
}

const api = useApi()
const busy = ref(false)
const msg = ref('')
const importOuvert = ref(false)
const texteImport = ref('')
const apercu = ref<{ aCreer: number, dejaPresents: number, rejets: string[] } | null>(null)
const ajoutOuvert = ref(false)
const nouveau = reactive({ hote: '', port: 443, libelle: '', type: 'web' })

const { data: etat, refresh: rafraichirEtat } = await useAsyncData(
  'sites-etat', () => api<Etat>('/api/sites-services/etat'), { getCachedData: () => undefined },
)
// `/liste` et non le catalogue générique : les états viennent d'une jointure entre les
// détections, le référentiel et le certificat, que le générique ne calcule pas.
const { data: liste, refresh: rafraichirListe } = await useAsyncData(
  'sites-liste',
  () => api<{ resultats: Service[], total: number }>('/api/sites-services/liste'),
  { getCachedData: () => undefined },
)

const TYPES: Record<string, string> = {
  web: 'Site web', messagerie: 'Messagerie', annuaire: 'Annuaire', autre: 'Autre service',
}
const TON_TYPE: Record<string, string> = {
  web: 'blue', messagerie: 'purple', annuaire: 'primary', autre: 'gray',
}

// QUATRE ÉTATS, jamais deux. Sans le dernier, un service jamais relevé s'afficherait en vert.
const MAJ: Record<string, { l: string, t: string }> = {
  a_jour: { l: 'À jour', t: 'emerald' },
  correctif_disponible: { l: 'Correctif dispo.', t: 'amber' },
  non_maintenue: { l: 'Non maintenue', t: 'red' },
  version_inconnue: { l: 'Version inconnue', t: 'gray' },
}
const SUPPORT: Record<string, { l: string, t: string }> = {
  ok: { l: 'Supporté', t: 'emerald' },
  // L'éditeur déclare le support en cours SANS annoncer de date. Distinct de `ok`, qui repose
  // sur une date future connue : les fondre ferait disparaître la différence entre « on sait
  // jusqu'à quand » et « on ne sait pas jusqu'à quand, mais c'est supporté ».
  supporte: { l: 'Supporté — sans date annoncée', t: 'emerald' },
  bientot: { l: 'Fin sous 1 an', t: 'amber' },
  etendu: { l: 'Support étendu', t: 'blue' },
  depasse: { l: 'Hors support', t: 'red' },
  inconnu: { l: 'Support inconnu', t: 'gray' },
}
const CERT: Record<string, { l: string, t: string }> = {
  valide: { l: 'Certificat valide', t: 'emerald' },
  expire_bientot: { l: 'Certificat expire bientôt', t: 'amber' },
  expire: { l: 'Certificat expiré', t: 'red' },
  invalide: { l: 'Certificat invalide', t: 'red' },
  injoignable: { l: 'Hôte injoignable', t: 'amber' },
  jamais_releve: { l: 'Certificat jamais relevé', t: 'gray' },
  aucun: { l: 'Aucun certificat', t: 'gray' },
}

/**
 * Le libellé de la mise à jour. PAS DE FRACTION.
 */
// LES CONSTATS OUVERTS PAR SERVICE, comptés par la base. Un service « sans pastille » n'a pas
// de constat ouvert ; il peut n'avoir jamais été relevé, ce que la fiche dit et pas la liste.
const { data: constatsParService } = await useAsyncData(
  'sites-constats',
  () => api<Record<string, { total: number, pireGravite: string }>>('/api/audit-surface/par-service').catch(() => null),
  { getCachedData: () => undefined },
)
const TON_GRAVITE: Record<string, string> = {
  critique: 'red', elevee: 'red', moyenne: 'amber', faible: 'blue', info: 'gray',
}

const search = ref('')
const activeFilters = ref<Record<string, (string | number)[]>>({})

/**
 * LES FILTRES SONT DÉRIVÉS DES TABLES DE LIBELLÉS, pas retapés. Écrits une seconde fois, ils
 * divergent : une valeur ajoutée à `MAJ` sans sa ligne de filtre donne une pastille qu'aucun
 * filtre ne sait retrouver — visible et introuvable.
 */
const options = (m: Record<string, { l: string, t: string }>) =>
  Object.entries(m).map(([value, v]) => ({ value, label: v.l }))

/**
 * LES TECHNOLOGIES PRÉSENTES, au niveau du PRODUIT. « WordPress », pas « WordPress 6.4.2 » :
 * une option par version donnerait autant d'entrées que de sites, c'est-à-dire une liste qui ne
 * regroupe rien.
 */
const TECHNOS = computed(() => {
  const vus = new Map<string, string>()
  for (const s2 of liste.value?.resultats ?? [])
    for (const p of s2.technologies) if (!vus.has(p.toLowerCase())) vus.set(p.toLowerCase(), p)
  return [...vus].sort((a2, b2) => a2[1].localeCompare(b2[1])).map(([value, label]) => ({ value, label }))
})

const FILTRES = computed(() => [
  { key: 'type', label: 'Type', options: Object.entries(TYPES).map(([value, label]) => ({ value, label })) },
  { key: 'miseAJour', label: 'Mise à jour', options: options(MAJ) },
  {
    key: 'support',
    label: 'Support',
    // `aucun` n'est pas un état du vocabulaire : c'est l'ABSENCE de rapprochement.
    options: [...options(SUPPORT), { value: 'aucun', label: 'Aucune technologie rapprochée' }],
  },
  { key: 'certificat', label: 'Certificat', options: options(CERT) },
  { key: 'technologie', label: 'Technologie', options: TECHNOS.value },
])

const TRIS = [
  { value: 'hote', label: 'Hôte' },
  { value: 'technologie', label: 'Technologie' },
  { value: 'scan', label: 'Dernier relevé' },
]
const sortKey = ref('hote')
const sortDir = ref<'asc' | 'desc'>('asc')

const valeur = (s2: Service, cle: string): string =>
  cle === 'type'
    ? s2.type
    : cle === 'miseAJour'
      ? s2.miseAJour.etat
      : cle === 'support'
        ? (s2.support ?? 'aucun')
        : s2.certificat

/**
 * Un service porte PLUSIEURS technologies : le filtre garde le service dès que l'une d'elles
 * correspond.
 */
const correspond = (s2: Service, cle: string, vals: (string | number)[]) =>
  cle === 'technologie'
    ? s2.technologies.some(p => vals.includes(p.toLowerCase()))
    : vals.includes(valeur(s2, cle))

const listees = computed(() => {
  const q = search.value.trim().toLowerCase()
  const gardees = (liste.value?.resultats ?? []).filter((s2) => {
    // La recherche porte AUSSI sur les technologies détectées : « wordpress » doit rendre
    // les sites sous WordPress, ce que l'hôte seul ne dit jamais.
    if (q && ![s2.hote, s2.libelle ?? '', ...s2.technologies].some(x => x.toLowerCase().includes(q))) return false
    return Object.entries(activeFilters.value).every(([cle, vals]) => !vals.length || correspond(s2, cle, vals))
  })

  // Le tri sur le PRODUIT principal, sans sa version : « WordPress 6.4 » et
  // « WordPress 6.5 » doivent se suivre, pas se ranger sous deux lettres différentes.
  const cle = (s2: Service) =>
    sortKey.value === 'technologie'
      ? (s2.technologiePrincipale?.produit.toLowerCase() ?? '\uffff')
      : sortKey.value === 'scan'
        // Jamais relevé : chaîne vide, donc en tête en ordre croissant. C'est le bon
        // défaut — c'est là qu'il y a du travail, pas dans les relevés d'hier.
        ? (s2.dernierScanAt ?? '')
        : s2.hote.toLowerCase()
  const sens = sortDir.value === 'desc' ? -1 : 1
  return [...gardees].sort((a2, b2) => sens * (cle(a2) < cle(b2) ? -1 : cle(a2) > cle(b2) ? 1 : 0)
    || a2.hote.localeCompare(b2.hote))
})

const libelleMaj = (m: Service['miseAJour']) => {
  if (!m.partiel) return MAJ[m.etat] ?? { l: m.etat, t: 'gray' }
  const reste = m.surTechnologies - m.verifiees
  return { l: `${m.verifiees} à jour, ${reste} non vérifiée${reste > 1 ? 's' : ''}`, t: 'blue' }
}

type EtatBalayage = {
  enCours: boolean
  total: number
  traites: number
  ok: number
  echecs: number
  detections: number
  tronque: boolean
  ecartes: number
  fin: string | null
}
const balayage = ref<EtatBalayage | null>(null)
let minuteur: ReturnType<typeof setTimeout> | null = null

// LE RELEVÉ TOURNE CÔTÉ SERVEUR, l'écran le suit. Attendre la réponse d'un parcours de
// plusieurs centaines de sites faisait couper la requête par le proxy : l'écran annonçait un
// échec pendant que le relevé continuait.
const suivre = async () => {
  try {
    const e = await api<EtatBalayage>('/api/sites-services/scan/etat')
    balayage.value = e
    if (e.enCours) {
      minuteur = setTimeout(suivre, 2000)
      return
    }
    busy.value = false
    if (!e.fin) return // aucun balayage depuis le démarrage du serveur
    // Les échecs sont ANNONCÉS, jamais tus : un relevé qui n'a pas abouti laisse le service
    // avec ses détections précédentes, et le taire ferait lire des données anciennes comme
    // fraîches.
    msg.value = `${e.ok} service(s) relevé(s), ${e.detections} technologie(s) détectée(s)`
      + `${e.echecs ? `, ${e.echecs} en échec` : ''}`
      + `${e.tronque ? ` — ${e.ecartes} service(s) non relevé(s) ce passage (plafond atteint), relancez pour les suivants` : ''}.`
    await Promise.all([rafraichirEtat(), rafraichirListe()])
  }
  catch {
    busy.value = false
    msg.value = 'Impossible de suivre le relevé.'
  }
}

const relever = async () => {
  busy.value = true
  msg.value = ''
  try {
    const r = await api<EtatBalayage & { demarre: boolean }>('/api/sites-services/scan', { method: 'POST' })
    balayage.value = r
    if (!r.demarre) msg.value = 'Un relevé est déjà en cours : suivi de son avancement.'
    await suivre()
  }
  catch (e) {
    busy.value = false
    msg.value = messageErreur(e, 'Le relevé n\'a pas pu être lancé.')
  }
}

// UN RELEVÉ LANCÉ AILLEURS — autre onglet, autre personne, page rechargée — se suit aussi :
// sinon le bouton se relance par-dessus un passage en cours.
onMounted(async () => {
  const e = await api<EtatBalayage>('/api/sites-services/scan/etat').catch(() => null)
  if (e?.enCours) {
    busy.value = true
    balayage.value = e
    await suivre()
  }
})
onBeforeUnmount(() => {
  if (minuteur) clearTimeout(minuteur)
})

// IMPORT EN DEUX TEMPS. La simulation d'abord, l'écriture ensuite et sur demande : une
// faute de frappe dans une liste collée ne doit pas modifier le catalogue.
const simuler = async () => {
  busy.value = true
  try {
    apercu.value = await api('/api/sites-services/import', {
      method: 'POST',
      body: { texte: texteImport.value, dryRun: true },
    })
  }
  finally { busy.value = false }
}

const importer = async () => {
  busy.value = true
  try {
    const r = await api<{ crees: number, dejaPresents: number, rejets: string[] }>('/api/sites-services/import', {
      method: 'POST',
      body: { texte: texteImport.value, dryRun: false },
    })
    // Les rejets sont ANNONCÉS : une ligne écartée en silence se lit comme une ligne
    // importée, et l'écart ne se découvre qu'au moment où le site manque.
    msg.value = `${r.crees} service(s) créé(s), ${r.dejaPresents} déjà présent(s)`
      + (r.rejets.length ? `, ${r.rejets.length} ligne(s) rejetée(s)` : '') + '.'
    importOuvert.value = false
    texteImport.value = ''
    apercu.value = null
    await Promise.all([rafraichirEtat(), rafraichirListe()])
  }
  catch { msg.value = 'L\'import a échoué.' }
  finally { busy.value = false }
}

// AJOUT À L'UNITÉ. L'import ne doit pas être le seul chemin : déclarer un site suppose
// sinon d'en faire une liste, ce qui décourage la saisie du cas isolé.
const ajouter = async () => {
  if (!nouveau.hote.trim()) return
  busy.value = true
  try {
    await api('/api/sites-services', {
      method: 'POST',
      body: {
        hote: nouveau.hote.trim(),
        port: nouveau.port,
        libelle: nouveau.libelle.trim() || undefined,
        type: nouveau.type,
      },
    })
    msg.value = `${nouveau.hote.trim()} ajouté.`
    nouveau.hote = ''
    nouveau.libelle = ''
    ajoutOuvert.value = false
    await Promise.all([rafraichirEtat(), rafraichirListe()])
  }
  catch { msg.value = 'L\'ajout a échoué. Ce couple hôte et port existe peut-être déjà.' }
  finally { busy.value = false }
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Sites et services
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Les services exposés de l'établissement, leur certificat et les technologies qu'ils annoncent.
          Le relevé est passif : une requête sur la racine, aucune écriture.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UIButton
          variant="secondary"
          :disabled="busy"
          @click="ajoutOuvert = !ajoutOuvert; importOuvert = false"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Ajouter un site
        </UIButton>
        <UIButton
          variant="secondary"
          :disabled="busy"
          @click="importOuvert = !importOuvert; ajoutOuvert = false"
        >
          <Icon
            name="lucide:upload"
            class="size-4"
          /> Importer une liste
        </UIButton>
        <UIButton
          :disabled="busy"
          @click="relever"
        >
          <Icon
            name="lucide:radar"
            class="size-4"
          /> {{ balayage?.enCours ? `Relevé en cours… ${balayage.traites}/${balayage.total}` : 'Relever tous les services' }}
        </UIButton>
      </div>
    </header>

    <section
      v-if="ajoutOuvert"
      class="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-secondary-200/60 bg-secondary-50/50 p-5"
    >
      <label class="block w-full sm:w-auto">
        <span class="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">Hôte</span>
        <input
          v-model="nouveau.hote"
          placeholder="www.example.org"
          class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 sm:w-64"
          @keyup.enter="ajouter"
        >
      </label>
      <label class="block w-full sm:w-auto">
        <span class="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">Port</span>
        <input
          v-model.number="nouveau.port"
          type="number"
          class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 sm:w-24"
        >
      </label>
      <label class="block w-full sm:w-auto">
        <span class="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">Type</span>
        <select
          v-model="nouveau.type"
          class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 sm:w-auto"
        >
          <option
            v-for="(l, k) in TYPES"
            :key="k"
            :value="k"
          >
            {{ l }}
          </option>
        </select>
      </label>
      <label class="block min-w-48 flex-1">
        <span class="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">Libellé</span>
        <input
          v-model="nouveau.libelle"
          placeholder="Portail public"
          class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
          @keyup.enter="ajouter"
        >
      </label>
      <UIButton
        :disabled="busy || !nouveau.hote.trim()"
        @click="ajouter"
      >
        Ajouter
      </UIButton>
    </section>

    <section
      v-if="importOuvert"
      class="space-y-3 rounded-2xl border border-secondary-200/60 bg-secondary-50/50 p-5"
    >
      <div>
        <label class="text-sm font-medium text-secondary-800">Liste de sites</label>
        <p class="mt-0.5 text-xs text-secondary-500">
          Une entrée par ligne : <code>hote</code>, <code>hote:port</code> ou une URL complète.
          Une seconde colonne après une virgule devient le libellé. Les lignes commençant par
          <code>#</code> sont ignorées.
        </p>
      </div>
      <textarea
        v-model="texteImport"
        rows="7"
        placeholder="www.example.org, Portail public&#10;https://moodle.example.org/&#10;annuaire.example.org:636"
        class="w-full rounded-lg border border-secondary-200 bg-white p-3 font-mono text-xs text-secondary-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
      />
      <div class="flex flex-wrap items-center gap-2">
        <UIButton
          variant="secondary"
          :disabled="busy || !texteImport.trim()"
          @click="simuler"
        >
          Simuler
        </UIButton>
        <!-- L'écriture n'est offerte QU'APRÈS la simulation : on voit ce qui sera créé
             avant de le créer. -->
        <UIButton
          :disabled="busy || !apercu"
          @click="importer"
        >
          Importer
        </UIButton>
        <p
          v-if="apercu"
          class="text-sm text-secondary-600"
        >
          {{ apercu.aCreer }} à créer, {{ apercu.dejaPresents }} déjà présent(s)<template v-if="apercu.rejets.length">
            ,
            {{ apercu.rejets.length }} ligne(s) rejetée(s) : <span class="font-mono text-xs">{{ apercu.rejets.slice(0, 3).join(', ') }}</span>
          </template>.
        </p>
      </div>
    </section>

    <p
      v-if="msg"
      class="rounded-xl border border-secondary-200/70 bg-secondary-50/60 px-4 py-2.5 text-sm text-secondary-700"
    >
      {{ msg }}
    </p>

    <!-- L'AVERTISSEMENT VIENT AVANT LES CHIFFRES : il conditionne leur lecture. -->
    <p
      v-if="etat?.avertissement"
      class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      {{ etat.avertissement }}
    </p>

    <section
      v-if="etat"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div
        v-for="c in [
          { k: 'total', n: etat.total, label: 'service(s) surveillé(s)', sub: `${etat.sansApplication} sans application` },
          { k: 'maj', n: etat.parEtatMiseAJour.correctif_disponible ?? 0, label: 'correctif(s) disponible(s)', sub: `${etat.parEtatMiseAJour.non_maintenue ?? 0} sur version non maintenue` },
          { k: 'eol', n: etat.parStatutSupport.depasse ?? 0, label: 'hors support', sub: `${etat.sansSupportConnu} sans support connu` },
          { k: 'scan', n: etat.jamaisScanne, label: 'jamais relevé(s)', sub: `${etat.enTetes.jamaisReleves} sans en-tête relevé` },
        ]"
        :key="c.k"
        class="rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-sm"
      >
        <p class="text-2xl font-semibold tracking-tight text-secondary-900">
          {{ c.n.toLocaleString('fr-FR') }}<span class="ml-1 text-sm font-normal text-secondary-400">/ {{ etat.total }}</span>
        </p>
        <p class="mt-0.5 text-[13px] leading-tight text-secondary-700">
          {{ c.label }}
        </p>
        <!-- Le dénominateur et la réserve accompagnent chaque chiffre : « 12 hors support »
             ne se rapporte à rien sans le total, ni sans ce qu'on n'a pas pu juger. -->
        <p class="mt-1 text-xs text-secondary-500">
          {{ c.sub }}
        </p>
      </div>
    </section>

    <CatalogueFilterBar
      v-if="liste?.resultats?.length"
      v-model:search="search"
      v-model:active="activeFilters"
      v-model:sort="sortKey"
      v-model:sort-dir="sortDir"
      :filters="FILTRES"
      :sort-options="TRIS"
      perimetre="sites et services"
      :resultats="listees.length"
    />

    <!-- DES CARTES, ET NON UN TABLEAU. Le tableau avait six colonnes et `min-w-max` : sur un téléphone, il dépassait l'écran de trois largeurs, et le défilement horizontal d'un bloc qui occupe toute la page capture le geste vertical. -->
    <section
      v-if="listees.length"
      class="grid grid-cols-1 gap-3"
    >
      <NuxtLink
        v-for="s in listees"
        :key="s.id"
        :to="`/sites-services/${s.id}`"
        class="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] sm:p-5 md:flex-row md:items-center md:justify-between"
      >
        <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <div class="flex min-w-0 items-start gap-3">
          <Icon
            name="lucide:globe"
            class="mt-0.5 size-5 shrink-0 text-secondary-400 transition-colors group-hover:text-primary-500"
          />
          <div class="min-w-0">
            <h3 class="truncate text-base font-medium tracking-tight text-secondary-900 transition-colors group-hover:text-primary-900">
              {{ s.hote }}<span
                v-if="s.port !== 443"
                class="text-secondary-400"
              >:{{ s.port }}</span>
            </h3>
            <p
              v-if="s.libelle"
              class="truncate text-sm text-secondary-500"
            >{{ s.libelle }}</p>

            <!-- LE CMS, pas le serveur web. « nginx » s'afficherait sur tout le parc et
                 ne distinguerait rien ; c'est le CMS qui décide de la migration. -->
            <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-secondary-500">
              <template v-if="s.technologiePrincipale">
                <span class="text-secondary-700">{{ s.technologiePrincipale.produit }}</span>
                <span
                  v-if="s.technologiePrincipale.version"
                  class="font-mono text-secondary-500"
                >{{ s.technologiePrincipale.version }}</span>
                <!-- La version masquée est un FAIT, pas un vide : le taire ferait croire à
                     une détection incomplète de notre part. -->
                <span
                  v-else
                  class="text-secondary-400"
                >version masquée</span>
                <span
                  v-if="s.technologies.length > 1"
                  class="text-secondary-400"
                >+{{ s.technologies.length - 1 }}</span>
              </template>
              <span
                v-else
                class="text-secondary-400"
              >aucune technologie détectée</span>
              <!-- Fraîcheur du relevé : sans elle, un relevé de six mois s'affiche avec le
                   même aplomb qu'un relevé du matin. -->
              <span
                v-if="s.dernierScanAt"
                class="text-secondary-400"
              >· relevé le {{ fmt(s.dernierScanAt) }}</span>
            </p>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-1.5 md:justify-end">
          <Pill :tone="TON_TYPE[s.type] ?? 'gray'">
            {{ TYPES[s.type] ?? s.type }}
          </Pill>
          <!-- « Jamais relevé » est une PASTILLE et non une absence de date : un vide se lit
               comme une donnée manquante, alors que c'est un fait constaté. -->
          <Pill
            v-if="!s.dernierScanAt"
            tone="gray"
          >
            Jamais relevé
          </Pill>
          <Pill :tone="libelleMaj(s.miseAJour).t">
            {{ libelleMaj(s.miseAJour).l }}
          </Pill>
          <!-- SEULEMENT le dépassement, comme sur la fiche : une échéance de support est un fait de technologie, et sur une liste elle disputerait l'attention aux deux états qui appellent une action. -->
          <Pill
            v-if="s.support === 'depasse'"
            :tone="SUPPORT.depasse?.t ?? 'red'"
          >
            {{ SUPPORT.depasse?.l ?? 'Hors support' }}
          </Pill>
          <Pill :tone="CERT[s.certificat]?.t ?? 'gray'">
            {{ CERT[s.certificat]?.l ?? s.certificat }}
          </Pill>
          <!-- Ce que le moteur d'audit a relevé, et qui n'est pas encore tranché. -->
          <Pill
            v-if="constatsParService?.[s.id]"
            :tone="TON_GRAVITE[constatsParService[s.id]!.pireGravite] ?? 'gray'"
          >
            {{ constatsParService[s.id]!.total }} constat{{ constatsParService[s.id]!.total > 1 ? 's' : '' }}
          </Pill>
        </div>
      </NuxtLink>
    </section>

    <section
      v-else
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center"
    >
      <p class="text-sm text-secondary-600">
        Aucun service déclaré.
      </p>
      <p class="mt-1 text-xs text-secondary-500">
        Les certificats surveillés créent automatiquement leur service au premier déploiement.
      </p>
    </section>

    <p
      v-if="etat"
      class="text-xs text-secondary-500"
    >
      En-têtes de sécurité présents — HSTS {{ etat.enTetes.hsts }}, CSP {{ etat.enTetes.csp }},
      X-Frame-Options {{ etat.enTetes.xFrameOptions }}, Referrer-Policy {{ etat.enTetes.referrerPolicy }},
      sur {{ etat.total }} service(s). {{ etat.enTetes.jamaisReleves }} n'ont jamais été relevés.
    </p>
  </div>
</template>
