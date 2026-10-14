<script setup lang="ts">
// CONNECTEUR LDAPS — admin. Configuration, correspondance des unités, rattachement.
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'

const api = useApi()
const perms = await usePermissions()
if (!perms.isAdmin.value) throw createError({ statusCode: 403, statusMessage: 'Réservé aux administrateurs' })

type Config = {
  url: string | null
  bindDn: string | null
  baseDn: string | null
  filtre: string | null
  actif: boolean
  frequenceHeures: number
  dernierSyncAt: string | null
  dernierStatut: string
  dernierMessage: string | null
  motDePasseDefini: boolean
}
type Corr = {
  id: string
  code: string | null
  nomGlpi: string | null
  libelleLdap: string | null
  nature: string
  typeComposante: string | null
  intitule: string
  sigle: string | null
  composanteCode: string | null
  fusionneeAvec: string | null
  source: string
  note: string | null
}
type Vue = { id: string, provenance: string, valeur: string, code: string | null, effectif: number, declaree?: boolean }
type VueGlpi = { niveau: 2 | 3 | 4, valeur: string, parent: string | null, machines: number, declaree: boolean }
type Mfa = {
  total: { personnes: number, avecMfa: number, sansMfa: number, nonReleve: number }
  lignes: { composanteId: string | null, nom: string, personnes: number, avecMfa: number, sansMfa: number, nonReleve: number }[]
}

const { data: cfg, refresh: refreshCfg } = await useAsyncData('ldap-config', () => api<Config>('/api/ldap/config'), { getCachedData: () => undefined })
const { data: corrs, refresh: refreshCorrs } = await useAsyncData('ldap-corr', () => api<Corr[]>('/api/ldap/correspondances'), { getCachedData: () => undefined })
const { data: vues, refresh: refreshVues } = await useAsyncData(
  'ldap-vues',
  () => api<{ ldap: Vue[], glpi: VueGlpi[] }>('/api/ldap/valeurs-vues'),
  { getCachedData: () => undefined },
)
const { data: file, refresh: refreshFile } = await useAsyncData('ldap-file', () => api<{ total: number, personnes: number, lignes: Vue[] }>('/api/ldap/a-rapprocher'), { getCachedData: () => undefined })
const { data: mfa, refresh: refreshMfa } = await useAsyncData('ldap-mfa', () => api<Mfa>('/api/ldap/mfa/couverture'), { getCachedData: () => undefined })

/**
 * Le formulaire SUIT la configuration, il n'en prend pas une copie. Initialisé une seule fois
 * depuis `cfg.value`, il restait vide dès que la configuration arrivait après le montage — au
 * rendu serveur sans session, par exemple.
 */
const form = reactive({
  url: '', bindDn: '', motDePasse: '', baseDn: '', filtre: '', actif: false, frequenceHeures: 24,
})
watchEffect(() => {
  const c = cfg.value
  if (!c) return
  form.url = c.url ?? ''
  form.bindDn = c.bindDn ?? ''
  form.baseDn = c.baseDn ?? ''
  form.filtre = c.filtre ?? ''
  form.actif = c.actif
  form.frequenceHeures = c.frequenceHeures
})

const busy = ref(false)
const msg = ref('')
const msgTon = ref<'ok' | 'ko'>('ok')
const dire = (t: string, ok = true) => {
  msg.value = t
  msgTon.value = ok ? 'ok' : 'ko'
}

const enregistrer = async () => {
  if (busy.value) return
  busy.value = true
  try {
    await api('/api/ldap/config', { method: 'PUT', body: { ...form } })
    // Le champ se vide après enregistrement : il n'affiche jamais le secret, et le
    // laisser rempli ferait croire qu'il est relu.
    form.motDePasse = ''
    await refreshCfg()
    dire('Configuration enregistrée.')
  }
  catch (e) { dire(messageErreur(e, 'Enregistrement refusé.'), false) }
  finally { busy.value = false }
}

const tester = async () => {
  if (busy.value) return
  busy.value = true
  try {
    const r = await api<{ ok: boolean, message: string }>('/api/ldap/test', { method: 'POST' })
    dire(r.message, r.ok)
  }
  finally { busy.value = false }
}

const lancer = async (simulation: boolean) => {
  if (busy.value) return
  busy.value = true
  try {
    const r = await api<{ ok: boolean, message?: string, sansRattachement?: number, aRapprocher?: number }>(
      simulation ? '/api/ldap/simuler' : '/api/ldap/synchroniser', { method: 'POST' },
    )
    dire((simulation ? 'Simulation — ' : '') + (r.message ?? 'Terminé.'), r.ok)
    if (!simulation) await Promise.all([refreshCfg(), refreshFile(), refreshMfa()])
  }
  catch (e) { dire(messageErreur(e, simulation ? 'Simulation impossible.' : 'Synchronisation impossible.'), false) }
  finally { busy.value = false }
}

// --- La correspondance ----------------------------------------------------------------
const NATURES = [
  { value: 'composante', label: 'Composante' },
  { value: 'laboratoire', label: 'Laboratoire' },
  { value: 'service', label: 'Service' },
  { value: 'departement', label: 'Département' },
  { value: 'pole', label: 'Pôle' },
  // « ignorer » n'est pas un défaut de saisie : c'est une décision, et la note dit laquelle.
  { value: 'ignorer', label: 'Ne pas rattacher' },
]
const TON_NATURE: Record<string, string> = {
  composante: 'primary', laboratoire: 'purple', service: 'blue',
  departement: 'emerald', pole: 'amber', ignorer: 'gray',
}
const libelleNature = (n: string) => NATURES.find(x => x.value === n)?.label ?? n

// LES LISTES SONT DYNAMIQUES : elles proposent ce que les sources contiennent réellement, avec
// l'effectif derrière chaque valeur.
const codesVus = computed(() => {
  const m = new Map<string, { n: number, exemple: string, declaree: boolean }>()
  for (const v of vues.value?.ldap ?? []) {
    if (!v.code) continue
    const d = m.get(v.code) ?? { n: 0, exemple: v.valeur, declaree: v.declaree === true }
    d.n += v.effectif
    m.set(v.code, d)
  }
  return [...m].filter(([, d]) => !d.declaree).sort((a, b) => b[1].n - a[1].n)
})

const aAssocier = computed(() =>
  (corrs.value ?? []).filter(c => !c.nomGlpi && c.nature !== 'ignorer').length)

/**
 * UNE LISTE NE DOIT JAMAIS MENTIR SUR CE QU'ELLE PORTE. Un `<select>` dont la valeur liée ne
 * figure dans aucune option affiche la PREMIÈRE — ici « — aucun — » — sans rien changer au
 * modèle.
 */
function avecValeurCourante<T>(
  options: T[],
  courante: string,
  valeurDe: (o: T) => string,
  fabriquer: (v: string) => T,
): T[] {
  if (!courante || options.some(o => valeurDe(o) === courante)) return options
  return [fabriquer(courante), ...options]
}

const optionsCode = computed(() =>
  avecValeurCourante(
    codesVus.value.map(([c, d]) => ({ valeur: c, texte: `${c} · ${d.n} personne${d.n > 1 ? 's' : ''} — ${d.exemple.slice(0, 40)}` })),
    nouveau.code,
    o => o.valeur,
    v => ({ valeur: v, texte: `${v} — ⚠ déjà déclaré par une autre correspondance` }),
  ))

const optionsGlpi = computed(() =>
  avecValeurCourante(
    nomsGlpi.value.map(g => ({ valeur: g.valeur, texte: `${g.valeur} · ${g.machines} machine${g.machines > 1 ? 's' : ''} (${NIVEAUX[g.niveau]}${g.parent ? ` sous ${g.parent}` : ''})` })),
    nouveau.nomGlpi,
    o => o.valeur,
    v => ({ valeur: v, texte: `${v} — ⚠ déjà associée à une autre correspondance` }),
  ))

/**
 * LES FUSIONS POSSIBLES, les plus proches en tête. L'annuaire porte plusieurs écritures d'une
 * même unité, et aucune règle ne les rattrapera toutes : « UFR SANTE » contre « UFR Sciences de
 * la santé », une faute de frappe, un renommage.
 */
const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const motsDe = (x: string) => new Set(norm(x).split(/[^a-z0-9]+/).filter(m => m.length > 3))

/**
 * TOUTES LES CIBLES POSSIBLES, LES PLUS PROCHES EN TÊTE — et jamais une liste vide.
 */
const fusionsPossibles = computed(() => {
  const mots = motsDe(`${nouveau.intitule} ${nouveau.libelleLdap}`)
  const code = nouveau.composanteCode || nouveau.code
  return (corrs.value ?? [])
    .filter(c => c.nature !== 'ignorer' && !c.fusionneeAvec)
    .map((c) => {
      const sien = motsDe(`${c.intitule} ${c.nomGlpi ?? ''} ${c.libelleLdap ?? ''}`)
      let score = 0
      for (const m of mots) if (sien.has(m)) score += 2
      // Le même code de composante vaut un indice fort : c'est la seule chose que deux
      // écritures d'une même unité partagent à coup sûr.
      if (code && (c.code === code || c.composanteCode === code)) score += 3
      return { c, score }
    })
    .sort((a, b) => b.score - a.score || a.c.intitule.localeCompare(b.c.intitule))
})

const NIVEAUX: Record<number, string> = { 2: 'composante', 3: 'service / département', 4: 'sous-unité' }
const nomsGlpi = computed(() =>
  (vues.value?.glpi ?? []).filter(v => !v.declaree))

/**
 * Ce que le relevé a vu et que la table ignore, PROPOSÉ EN UN CLIC. Sans ce raccourci, déclarer
 * une unité demande de recopier son code et son intitulé depuis la file jusqu'au formulaire —
 * vingt-neuf fois, à la main, avec ce que cela suppose de fautes de frappe sur des chaînes qui
 * doivent correspondre…
 */
const declarer = (l: Vue) => {
  nouveau.code = l.code ?? ''
  nouveau.nomGlpi = ''
  nouveau.libelleLdap = ''
  nouveau.composanteCode = ''
  const brut = (l.valeur ?? '').trim()

  if (l.provenance === 'ldap_service') {
    // LE CODE PORTÉ PAR UNE LIGNE DE SERVICE EST CELUI DE SA COMPOSANTE, pas le sien.
    nouveau.code = ''
    // LE LIBELLÉ EST LA CLÉ à ce niveau : les services n'ont pas de code, et c'est cette
    // chaîne exacte que la synchronisation retrouvera.
    nouveau.libelleLdap = brut
    const sansPrefixe = brut.replace(/^\s*d[ée]partement\s+/i, '').trim()
    nouveau.nature = /^\s*d[ée]partement\b/i.test(brut) ? 'departement' : 'service'
    // La composante se reconnaît parmi celles déjà déclarées, du préfixe le plus long au
    // plus court : « UFR STGI » doit l'emporter sur « UFR ST ».
    const parents = (corrs.value ?? [])
      .filter(c => (c.nature === 'composante' || c.nature === 'laboratoire') && c.code)
      .flatMap(c => [c.nomGlpi, c.intitule].filter(Boolean).map(n => ({ nom: n as string, code: c.code! })))
      .sort((a, b) => b.nom.length - a.nom.length)
    const trouve = parents.find(x =>
      sansPrefixe.toLowerCase() === x.nom.toLowerCase()
      || sansPrefixe.toLowerCase().startsWith(`${x.nom.toLowerCase()} `))
    // À défaut de reconnaissance dans le libellé, le code que la file porte EST celui de
    // la composante : c'est là qu'il a sa place.
    nouveau.composanteCode = trouve?.code ?? l.code ?? ''
    nouveau.intitule = trouve ? sansPrefixe.slice(trouve.nom.length).trim() || sansPrefixe : sansPrefixe
  }
  else {
    nouveau.nature = l.provenance === 'ldap_labo' ? 'laboratoire' : 'composante'
    // L'intitulé proposé est celui de l'annuaire, débarrassé de son code : il faut souvent le
    // corriger — les libellés sont périmés ou tronqués — mais partir de quelque chose vaut
    // mieux que d'une page blanche.
    nouveau.intitule = brut.replace(/^\s*[A-Z]{0,2}\d{3,5}[A-Z]{0,2}\s+/, '').trim()
  }
  document.getElementById('form-correspondance')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const nouveau = reactive({ code: '', nomGlpi: '', libelleLdap: '', nature: 'composante', intitule: '', composanteCode: '', fusionneeAvec: '', note: '' })
const ajouter = async () => {
  if (busy.value || !nouveau.intitule.trim()) return
  busy.value = true
  try {
    await api('/api/ldap/correspondances', {
      method: 'POST',
      body: {
        code: nouveau.code.trim() || null,
        nomGlpi: nouveau.nomGlpi.trim() || null,
        libelleLdap: nouveau.libelleLdap.trim() || null,
        nature: nouveau.nature,
        intitule: nouveau.intitule.trim(),
        composanteCode: nouveau.composanteCode.trim() || null,
        fusionneeAvec: nouveau.fusionneeAvec || null,
        note: nouveau.note.trim() || null,
      },
    })
    Object.assign(nouveau, { code: '', nomGlpi: '', libelleLdap: '', nature: 'composante', intitule: '', composanteCode: '', fusionneeAvec: '', note: '' })
    await Promise.all([refreshCorrs(), refreshFile(), refreshVues()])
    dire('Correspondance ajoutée.')
  }
  catch (e) { dire(messageErreur(e, 'Ajout refusé.'), false) }
  finally { busy.value = false }
}

/**
 * ASSOCIER UNE LIGNE EXISTANTE À SON UNITÉ GLPI, sans repasser par le formulaire.
 */
const associer = async (c: Corr, nomGlpi: string) => {
  if (busy.value) return
  busy.value = true
  try {
    await api(`/api/ldap/correspondances/${c.id}`, { method: 'PATCH', body: { nomGlpi: nomGlpi || null } })
    await Promise.all([refreshCorrs(), refreshVues()])
    dire(nomGlpi ? `« ${c.intitule} » associée à « ${nomGlpi} ».` : 'Association retirée.')
  }
  catch (e) { dire(messageErreur(e, 'Association refusée.'), false) }
  finally { busy.value = false }
}

/**
 * RATTACHER UNE UNITÉ À SA COMPOSANTE, sur la ligne. Un service ou un département n'a de sens
 * que sous une composante : sans parent, il n'apparaît dans aucune ventilation et ne désigne
 * personne.
 */
const rattacher = async (c: Corr, code: string) => {
  if (busy.value) return
  busy.value = true
  try {
    await api(`/api/ldap/correspondances/${c.id}`, { method: 'PATCH', body: { composanteCode: code || null } })
    await refreshCorrs()
    dire(code ? `« ${c.intitule} » rattachée à ${code}.` : 'Rattachement retiré.')
  }
  catch (e) { dire(messageErreur(e, 'Rattachement refusé.'), false) }
  finally { busy.value = false }
}

/** Les composantes déclarées, seules cibles possibles d'un rattachement. */
const composantesCibles = computed(() =>
  (corrs.value ?? []).filter(c => c.nature === 'composante' && c.code))

/**
 * Détacher un alias : il redevient une unité à part entière. C'est ce qui distingue une fusion
 * d'une suppression, et il faut donc pouvoir le faire sans supprimer la ligne — sinon le
 * libellé retomberait dans la file et tout serait à refaire.
 */
const detacher = async (c: Corr) => {
  if (busy.value) return
  busy.value = true
  try {
    await api(`/api/ldap/correspondances/${c.id}`, { method: 'PATCH', body: { fusionneeAvec: null } })
    await refreshCorrs()
    dire('Fusion annulée : la ligne redevient une unité à part entière.')
  }
  catch (e) { dire(messageErreur(e, 'Annulation refusée.'), false) }
  finally { busy.value = false }
}

const supprimer = async (c: Corr) => {
  if (!confirm(`Supprimer la correspondance « ${c.intitule} » ?\n\nLes personnes qu'elle rattache repasseront « sans rattachement » au prochain relevé.`)) return
  try {
    await api(`/api/ldap/correspondances/${c.id}`, { method: 'DELETE' })
    await Promise.all([refreshCorrs(), refreshFile(), refreshVues()])
  }
  catch (e) { dire(messageErreur(e, 'Suppression refusée.'), false) }
}

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : null
const pourcent = (n: number, sur: number) => (sur ? `${Math.round((n / sur) * 100)} %` : '—')

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-2">
      <UITitle class="tracking-tight text-secondary-900">
        Annuaire LDAP
      </UITitle>
      <p class="text-sm text-secondary-600/90">
        Lecture seule. Peuple le référentiel des personnes et les rattache à leur composante,
        service, département ou laboratoire.
      </p>
      <p class="text-xs text-secondary-500">
        Les doctorants sont inclus, les étudiants non : le catalogue sert à désigner des responsables.
      </p>
    </header>

    <p
      v-if="msg"
      class="rounded-xl border px-4 py-2 text-sm"
      :class="msgTon === 'ok' ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700' : 'border-red-200 bg-red-50/60 text-red-700'"
    >
      {{ msg }}
    </p>

    <!-- Configuration -->
    <section :class="[TUILE, 'space-y-3']">
      <h2 class="text-sm font-semibold tracking-tight text-secondary-900">
        Connexion
      </h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1">
          <span class="text-xs font-medium text-secondary-600">Serveur</span>
          <input
            v-model="form.url"
            :class="CHAMP"
            placeholder="ldaps://ldaps.example.org"
          >
        </label>
        <label class="space-y-1">
          <span class="text-xs font-medium text-secondary-600">Compte de service</span>
          <input
            v-model="form.bindDn"
            :class="CHAMP"
            placeholder="cn=…,ou=services,dc=example,dc=org"
          >
        </label>
        <label class="space-y-1">
          <span class="text-xs font-medium text-secondary-600">
            Mot de passe
            <span class="font-normal text-secondary-400">
              {{ cfg?.motDePasseDefini ? '— enregistré, laisser vide pour ne pas changer' : '— non renseigné' }}
            </span>
          </span>
          <input
            v-model="form.motDePasse"
            type="password"
            :class="CHAMP"
            autocomplete="new-password"
          >
        </label>
        <label class="space-y-1">
          <span class="text-xs font-medium text-secondary-600">DN de base</span>
          <input
            v-model="form.baseDn"
            :class="CHAMP"
          >
        </label>
        <label class="space-y-1 sm:col-span-2">
          <span class="text-xs font-medium text-secondary-600">Filtre de recherche</span>
          <input
            v-model="form.filtre"
            :class="[CHAMP, 'font-mono text-xs']"
          >
        </label>
        <label class="flex items-center gap-2 text-sm text-secondary-700">
          <input
            v-model="form.actif"
            type="checkbox"
            class="size-4 rounded border-secondary-300"
          > Synchronisation automatique
        </label>
        <label class="space-y-1">
          <span class="text-xs font-medium text-secondary-600">Fréquence (heures)</span>
          <input
            v-model.number="form.frequenceHeures"
            type="number"
            min="0"
            :class="CHAMP"
          >
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <UIButton
          :disabled="busy"
          @click="enregistrer"
        >
          Enregistrer
        </UIButton>
        <UIButton
          variant="secondary"
          :disabled="busy"
          @click="tester"
        >
          Tester la connexion
        </UIButton>
        <!-- SIMULER AVANT D'ÉCRIRE. La première synchronisation touche deux mille fiches
             et il n'existe pas de bouton pour revenir en arrière. -->
        <UIButton
          variant="secondary"
          :disabled="busy"
          @click="lancer(true)"
        >
          Simuler
        </UIButton>
        <UIButton
          :disabled="busy"
          @click="lancer(false)"
        >
          Synchroniser
        </UIButton>
        <span
          v-if="cfg?.dernierSyncAt"
          class="text-xs text-secondary-500"
        >
          Dernier relevé {{ fmt(cfg.dernierSyncAt) }} — {{ cfg.dernierStatut }}
        </span>
      </div>
      <p
        v-if="cfg?.dernierMessage"
        class="text-xs text-secondary-500"
      >
        {{ cfg.dernierMessage }}
      </p>
    </section>

    <!-- La file à rapprocher : elle dit ce que vaut la ventilation. -->
    <section
      v-if="file?.total"
      class="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"
    >
      <h2 class="text-sm font-semibold tracking-tight text-amber-900">
        {{ file.total }} unité(s) rencontrée(s) et non déclarée(s)
      </h2>
      <p class="mt-0.5 text-xs text-amber-800">
        {{ file.personnes }} personne(s) concernée(s). Elles restent sans rattachement tant que
        la correspondance n'est pas déclarée — ce n'est pas une erreur, c'est une déclaration
        qui manque.
      </p>
      <div class="mt-3 space-y-1">
        <div
          v-for="l in file.lignes.slice(0, 40)"
          :key="l.id"
          class="flex items-baseline gap-3 rounded-lg px-1 py-1 text-sm hover:bg-amber-100/50"
        >
          <span class="w-12 shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-amber-700">{{ l.effectif }}</span>
          <span
            v-if="l.code"
            class="w-16 shrink-0 font-mono text-xs text-secondary-500"
          >{{ l.code }}</span>
          <span class="min-w-0 flex-1 truncate text-secondary-800">{{ l.valeur }}</span>
          <!-- Recopier vingt-neuf codes et intitulés à la main, c'est vingt-neuf occasions
               de fautes de frappe sur des chaînes qui doivent correspondre exactement. -->
          <button
            class="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-50"
            @click="declarer(l)"
          >
            Déclarer
          </button>
        </div>
      </div>
    </section>

    <!-- Couverture MFA -->
    <section
      v-if="mfa?.total.personnes"
      :class="[TUILE, 'space-y-3']"
    >
      <div>
        <h2 class="text-sm font-semibold tracking-tight text-secondary-900">
          Activation de la MFA
        </h2>
        <p class="mt-0.5 text-xs text-secondary-500">
          Déduite de la présence d'une adresse de recours dans l'annuaire. L'adresse elle-même
          n'est jamais stockée.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="rounded-xl border border-secondary-100 bg-secondary-50/40 px-3 py-2">
          <span class="block text-2xl font-semibold leading-none tabular-nums text-secondary-800">{{ mfa.total.personnes }}</span>
          <span class="mt-1 block text-[11px] text-secondary-600">personnes actives</span>
        </div>
        <div
          class="rounded-xl border px-3 py-2"
          :class="mfa.total.sansMfa ? 'border-red-200 bg-red-50/50' : 'border-secondary-100 bg-secondary-50/40'"
        >
          <span
            class="block text-2xl font-semibold leading-none tabular-nums"
            :class="mfa.total.sansMfa ? 'text-red-600' : 'text-secondary-400'"
          >{{ mfa.total.sansMfa }}<span class="ml-1.5 text-sm font-normal">{{ pourcent(mfa.total.sansMfa, mfa.total.personnes) }}</span></span>
          <span class="mt-1 block text-[11px] text-secondary-600">sans MFA</span>
        </div>
        <div class="rounded-xl border border-secondary-100 bg-secondary-50/40 px-3 py-2">
          <span class="block text-2xl font-semibold leading-none tabular-nums text-emerald-600">{{ mfa.total.avecMfa }}</span>
          <span class="mt-1 block text-[11px] text-secondary-600">avec MFA</span>
        </div>
      </div>
      <!-- `nonReleve` COMPTÉ À PART : une fiche jamais relevée n'est pas une fiche sans
           MFA, et les additionner annoncerait un trou qui n'existe pas. -->
      <p
        v-if="mfa.total.nonReleve"
        class="text-xs text-secondary-600"
      >
        {{ mfa.total.nonReleve }} personne(s) n'ont jamais été relevées : elles ne comptent ni
        dans « avec MFA », ni dans « sans MFA ».
      </p>
      <div class="space-y-1 border-t border-secondary-100 pt-3">
        <div
          v-for="l in mfa.lignes.slice(0, 30)"
          :key="l.nom"
          class="flex flex-wrap items-baseline gap-x-3 text-sm"
        >
          <span class="min-w-0 flex-1 truncate text-secondary-800">{{ l.nom }}</span>
          <span class="shrink-0 tabular-nums text-secondary-500">{{ l.personnes }} personnes</span>
          <span
            class="w-28 shrink-0 text-right tabular-nums"
            :class="l.sansMfa ? 'font-semibold text-red-600' : 'text-secondary-400'"
          >{{ l.sansMfa }} sans MFA</span>
          <span class="w-12 shrink-0 text-right tabular-nums text-secondary-400">{{ pourcent(l.sansMfa, l.personnes) }}</span>
        </div>
      </div>
    </section>

    <!-- La correspondance des unités -->
    <section :class="[TUILE, 'space-y-3']">
      <div>
        <h2 class="text-sm font-semibold tracking-tight text-secondary-900">
          Correspondance des unités
        </h2>
        <p class="mt-0.5 text-xs text-secondary-500">
          Le seul endroit où GLPI et l'annuaire se rejoignent : ils ne nomment pas la même
          chose. Sert aussi à la synchronisation GLPI, et passe devant sa règle sur l'intitulé.
        </p>
      </div>

      <div
        id="form-correspondance"
        class="grid gap-2 rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3 sm:grid-cols-6"
      >
        <!-- LISTE DÉRIVÉE DE L'ANNUAIRE : les codes réellement rencontrés, avec le nombre
             de personnes derrière chacun, et sans ceux déjà déclarés. -->
        <label class="space-y-1 sm:col-span-2">
          <span class="text-xs font-medium text-secondary-600">
            Code annuaire
            <span class="font-normal text-secondary-400">— {{ codesVus.length }} non déclaré(s)</span>
          </span>
          <select
            v-model="nouveau.code"
            :class="CHAMP"
          >
            <option value="">
              — aucun —
            </option>
            <option
              v-for="o in optionsCode"
              :key="o.valeur"
              :value="o.valeur"
            >
              {{ o.texte }}
            </option>
          </select>
        </label>

        <!-- LISTE DÉRIVÉE DE GLPI : les unités de l'arborescence, avec leur niveau et le nombre de machines. -->
        <label class="space-y-1 sm:col-span-2">
          <span class="text-xs font-medium text-secondary-600">
            Unité GLPI
            <span class="font-normal text-secondary-400">— {{ nomsGlpi.length }} non déclarée(s)</span>
          </span>
          <select
            v-model="nouveau.nomGlpi"
            :class="CHAMP"
          >
            <option value="">
              — aucune —
            </option>
            <option
              v-for="o in optionsGlpi"
              :key="o.valeur"
              :value="o.valeur"
            >
              {{ o.texte }}
            </option>
          </select>
        </label>

        <label class="space-y-1">
          <span class="text-xs font-medium text-secondary-600">Nature</span>
          <select
            v-model="nouveau.nature"
            :class="CHAMP"
          >
            <option
              v-for="n in NATURES"
              :key="n.value"
              :value="n.value"
            >{{ n.label }}</option>
          </select>
        </label>

        <label class="space-y-1">
          <span class="text-xs font-medium text-secondary-600">Composante parente</span>
          <select
            v-model="nouveau.composanteCode"
            :class="CHAMP"
          >
            <option value="">
              — aucune —
            </option>
            <option
              v-for="c in (corrs ?? []).filter(x => x.nature === 'composante' && x.code)"
              :key="c.id"
              :value="c.code!"
            >{{ c.code }} — {{ c.intitule.slice(0, 40) }}</option>
          </select>
        </label>

        <label class="space-y-1 sm:col-span-3">
          <span class="text-xs font-medium text-secondary-600">
            Libellé annuaire
            <span class="font-normal text-secondary-400">— la clé des services, qui n'ont pas de code</span>
          </span>
          <input
            v-model="nouveau.libelleLdap"
            :class="[CHAMP, 'font-mono text-xs']"
            placeholder="Département IUT BV Sciences des données"
          >
        </label>

        <!-- LA FUSION, toujours offerte dès qu'il existe une unité à laquelle renvoyer. -->
        <label
          v-if="fusionsPossibles.length"
          class="space-y-1 sm:col-span-6"
        >
          <span class="text-xs font-medium text-secondary-600">
            Ou fusionner avec une unité existante
            <span class="font-normal text-secondary-400">— une seconde écriture du même service, pas une nouvelle unité</span>
          </span>
          <select
            v-model="nouveau.fusionneeAvec"
            :class="CHAMP"
          >
            <option value="">
              — créer une nouvelle unité —
            </option>
            <option
              v-for="f in fusionsPossibles"
              :key="f.c.id"
              :value="f.c.id"
            >
              {{ f.score >= 3 ? '★ ' : '' }}{{ f.c.intitule }}{{ f.c.nomGlpi ? ` (${f.c.nomGlpi})` : '' }}
              — {{ libelleNature(f.c.nature) }}{{ f.c.code ? ` · ${f.c.code}` : '' }}
            </option>
          </select>
        </label>

        <p
          v-else
          class="text-xs text-secondary-400 sm:col-span-6"
        >
          Aucune unité déclarée pour l'instant : la fusion sera proposée dès qu'il y en aura une.
        </p>

        <label class="space-y-1 sm:col-span-5">
          <span class="text-xs font-medium text-secondary-600">
            Intitulé qui fait foi
            <span class="font-normal text-secondary-400">— celui de l'annuaire est souvent périmé ou tronqué</span>
          </span>
          <input
            v-model="nouveau.intitule"
            :class="CHAMP"
          >
        </label>
        <div class="flex items-end">
          <UIButton
            :disabled="busy || !nouveau.intitule.trim()"
            @click="ajouter"
          >
            Ajouter
          </UIButton>
        </div>
      </div>

      <p
        v-if="aAssocier"
        class="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800"
      >
        {{ aAssocier }} correspondance(s) déclarée(s) mais sans unité GLPI : elles ne désignent
        aucune composante existante. Les personnes qu'elles rattachent seront écrites sans
        composante, ou sous une unité créée pour l'occasion.
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-max text-sm">
          <thead class="border-b border-secondary-200/70 bg-secondary-50/60">
            <tr>
              <th class="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-secondary-500">
                Code
              </th>
              <th class="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-secondary-500">
                Nom GLPI
              </th>
              <th class="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-secondary-500">
                Nature
              </th>
              <th class="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-secondary-500">
                Composante
              </th>
              <th class="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-secondary-500">
                Intitulé
              </th>
              <th class="w-10" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in corrs ?? []"
              :key="c.id"
              class="border-b border-secondary-100 last:border-0 hover:bg-secondary-50/60"
              :class="c.fusionneeAvec ? 'bg-secondary-50/40 text-secondary-500' : ''"
            >
              <td class="px-3 py-2 font-mono text-xs font-semibold tabular-nums text-primary-700">
                {{ c.code ?? '—' }}
              </td>
              <td class="px-3 py-2">
                <span
                  v-if="c.fusionneeAvec"
                  class="text-xs text-secondary-300"
                >—</span>
                <select
                  v-else
                  :value="c.nomGlpi ?? ''"
                  class="w-52 rounded-md border px-2 py-1 text-xs outline-none transition-colors focus:border-primary-400"
                  :class="c.nomGlpi ? 'border-secondary-200 bg-white text-secondary-700' : 'border-amber-300 bg-amber-50/60 text-amber-800'"
                  :disabled="busy"
                  @change="associer(c, ($event.target as HTMLSelectElement).value)"
                >
                  <!-- SANS NOM GLPI, la correspondance ne désigne aucune composante
                       existante : le champ est ambré pour que le trou se voie. -->
                  <option value="">
                    {{ c.nature === 'ignorer' ? '— sans objet —' : '⚠ à associer' }}
                  </option>
                  <option
                    v-if="c.nomGlpi"
                    :value="c.nomGlpi"
                  >
                    {{ c.nomGlpi }}
                  </option>
                  <option
                    v-for="g in nomsGlpi"
                    :key="`${g.niveau}-${g.valeur}-${g.parent}`"
                    :value="g.valeur"
                  >
                    {{ g.valeur }} · {{ g.machines }} machine{{ g.machines > 1 ? 's' : '' }}
                  </option>
                </select>
              </td>
              <td class="px-3 py-2">
                <!-- UN ALIAS N'A PAS DE NATURE PROPRE. Afficher « service » sur une ligne dont la synchronisation ignore la nature la faisait passer pour une unité de plus, alors qu'elle ne fait que renvoyer. -->
                <Pill :tone="c.fusionneeAvec ? 'blue' : (TON_NATURE[c.nature] ?? 'gray')">
                  {{ c.fusionneeAvec ? 'Alias' : libelleNature(c.nature) }}
                </Pill>
              </td>
              <td class="px-3 py-2">
                <!-- Sans objet pour une composante — elle ne se rattache pas à elle-même —
                     et pour une unité volontairement écartée. -->
                <span
                  v-if="c.fusionneeAvec || c.nature === 'composante' || c.nature === 'ignorer'"
                  class="text-xs text-secondary-300"
                >—</span>
                <select
                  v-else
                  :value="c.composanteCode ?? ''"
                  class="w-44 rounded-md border px-2 py-1 text-xs outline-none transition-colors focus:border-primary-400"
                  :class="c.composanteCode
                    ? 'border-secondary-200 bg-white text-secondary-700'
                    : (c.nature === 'laboratoire' ? 'border-secondary-200 bg-white text-secondary-400' : 'border-amber-300 bg-amber-50/60 text-amber-800')"
                  :disabled="busy"
                  @change="rattacher(c, ($event.target as HTMLSelectElement).value)"
                >
                  <!-- Un service ou un département SANS composante ne sera jamais créé : la synchronisation ne pose rien hors d'une composante. -->
                  <option value="">
                    {{ c.nature === 'laboratoire' ? '— aucune (facultatif) —' : '⚠ à rattacher' }}
                  </option>
                  <option
                    v-for="p in composantesCibles"
                    :key="p.id"
                    :value="p.code!"
                  >
                    {{ p.code }} — {{ (p.nomGlpi ?? p.intitule).slice(0, 32) }}
                  </option>
                </select>
              </td>
              <td class="max-w-md px-3 py-2">
                <span class="text-secondary-800">{{ c.intitule }}</span>
                <span
                  v-if="c.libelleLdap"
                  class="mt-0.5 block font-mono text-[10px] leading-tight text-secondary-400"
                >{{ c.libelleLdap }}</span>
                <!-- Une ligne fusionnée n'a pas d'existence propre : elle renvoie. Le dire
                     évite qu'on essaie de la corriger là où elle ne décide de rien. -->
                <span
                  v-if="c.fusionneeAvec"
                  class="mt-0.5 flex flex-wrap items-baseline gap-2 text-[11px] leading-tight text-blue-700"
                >
                  <span>
                    Ce libellé d'annuaire renvoie à
                    « {{ (corrs ?? []).find(x => x.id === c.fusionneeAvec)?.intitule ?? 'une autre unité' }} ».
                    Aucune unité n'est créée pour lui.
                  </span>
                  <button
                    class="shrink-0 rounded border border-blue-200 px-1.5 py-0.5 text-[10px] transition-colors hover:bg-blue-50"
                    :disabled="busy"
                    @click="detacher(c)"
                  >
                    Détacher
                  </button>
                </span>
                <span
                  v-if="c.note"
                  class="mt-0.5 block text-[11px] leading-tight text-amber-700"
                >{{ c.note }}</span>
              </td>
              <td class="px-3 py-2 text-right">
                <button
                  class="text-secondary-300 transition-colors hover:text-red-600"
                  title="Supprimer"
                  @click="supprimer(c)"
                >
                  <Icon
                    name="lucide:trash-2"
                    class="size-4"
                  />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
