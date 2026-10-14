<script setup lang="ts">
// FIN DE VIE DES SYSTÈMES — quels systèmes ne sont plus supportés, et pour lesquels ignore-t-on
// la date ?

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('technologies')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
const editable = computed(() => perms.canWrite('technologies'))

type Ligne = { os: string, machines: number, finDeVie: string | null, finDeVieEtendue: string | null, eolStatut: 'depasse' | 'bientot' | 'ok' | 'inconnu' | 'etendu' | 'supporte', source: 'manuel' | 'api' | 'interne' | null, connuAutomatiquement: boolean }
type Etat = {
  lignes: Ligne[]
  resume: {
    osDistincts: number
    machinesTotal: number
    machinesDepassees: number
    machinesBientot: number
    machinesInconnues: number
    machinesEtendues: number
    machinesSupportees: number
    machinesOk: number
    osSansDate: number
    referentielConstruit: boolean
    avertissement: string | null
    machinesParStatut: Record<string, number>
    osParStatut: Record<string, number>
  }
}

const { data: e, refresh } = await useAsyncData('eol-etat', () => api<Etat>('/api/eol/etat'), { getCachedData: () => undefined })

const busy = ref(false)
const msg = ref('')
// Récupération depuis la source publique : ne touche jamais une date saisie à la main.
const synchroniser = async () => {
  if (busy.value) return
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{
      ok: boolean
      message?: string
      produits: number
      majStandard: number
      majEtendue: number
      preserveesManuelles: number
      nonTrouves: number
      /**
       * Dates que le Catalogue s'était attribuées et ne sait plus justifier. `?: number` et non
       * `number` : sur une version antérieure du serveur, le champ est ABSENT.
       */
      datesRetirees?: number
    }>('/api/eol/synchroniser', { method: 'POST' })
    msg.value = r.ok
      // `datesRetirees` est rendu MÊME À ZÉRO : c'est un résultat, pas une absence de résultat.
      ? `${r.produits} produit(s) interrogé(s) — ${r.majStandard} date(s) de support standard, `
      + `${r.majEtendue} date(s) de support étendu, ${r.preserveesManuelles} saisie(s) manuelle(s) préservée(s), `
      + `${r.nonTrouves} non trouvé(s)`
      + (r.datesRetirees === undefined
        ? '. (Cette version du serveur ne retire pas les dates devenues injustifiables.)'
        : `, ${r.datesRetirees} date(s) retirée(s) faute de pouvoir être justifiée(s).`)
      : (r.message ?? 'Source publique injoignable.')
    await refresh()
  }
  catch { msg.value = 'La récupération depuis endoflife.date a échoué.' }
  finally { busy.value = false }
}

const construire = async () => {
  if (busy.value) return
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{ osDistincts: number, crees: number, datesAjoutees: number, sansDate: number }>('/api/eol/construire', { method: 'POST' })
    msg.value = `${r.osDistincts} système(s) analysé(s) — ${r.crees} ajouté(s) au référentiel, ${r.datesAjoutees} date(s) renseignée(s) automatiquement, ${r.sansDate} sans date.`
    await refresh()
  }
  catch { msg.value = 'La construction du référentiel a échoué.' }
  finally { busy.value = false }
}

const STATUT = {
  depasse: { label: 'Hors support', cls: 'border-red-200 bg-red-50 text-red-700', ordre: 0 },
  bientot: { label: 'Bientôt', cls: 'border-amber-200 bg-amber-50 text-amber-700', ordre: 1 },
  inconnu: { label: 'Date inconnue', cls: 'border-secondary-300 bg-secondary-50 text-secondary-600', ordre: 2 },
  etendu: { label: 'Support étendu', cls: 'border-blue-200 bg-blue-50 text-blue-700', ordre: 1.5 },
  // L'éditeur confirme qu'il n'annonce pas de date de fin (cas d'Apple pour macOS).
  // À ne pas confondre avec « date inconnue » : ici l'information EST connue.
  supporte: { label: 'Supporté — sans date annoncée', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', ordre: 3.5 },
  ok: { label: 'Supporté', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', ordre: 3 },
} as const

// Édition en ligne : c'est ICI qu'on voit les trous, c'est donc ici qu'on doit pouvoir les
// combler — sans aller ouvrir la fiche technologie de chaque système.
const brouillon = reactive(new Map<string, string>())
const enregistrement = ref('')
const enregistrerDate = async (l: Ligne) => {
  const valeur = brouillon.get(l.os) ?? l.finDeVie ?? ''
  if (enregistrement.value || valeur === (l.finDeVie ?? '')) return
  enregistrement.value = l.os
  try {
    await api('/api/eol/date', { method: 'PATCH', body: { os: l.os, finDeVie: valeur || undefined } })
    await refresh()
    brouillon.delete(l.os)
  }
  finally { enregistrement.value = '' }
}

const filtre = ref<'' | Ligne['eolStatut']>('')
const lignes = computed(() => {
  const l = (e.value?.lignes ?? []).filter(x => !filtre.value || x.eolStatut === filtre.value)
  return [...l].sort((a, b) => STATUT[a.eolStatut].ordre - STATUT[b.eolStatut].ordre || b.machines - a.machines)
})

/**
 * Complète les technologies HORS systèmes depuis la source publique. Sans ce bouton, elles
 * n'étaient enrichies qu'au relevé d'un site : une date annoncée entre deux relevés n'arrivait
 * jamais.
 */
const enrichir = async () => {
  if (busy.value) return
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{
      technologies: number
      renseignees: number
      manuelles: number
      fraiches: number
      sansCorrespondance: number
    }>('/api/eol/enrichir-technologies', { method: 'POST' })
    msg.value = `${r.technologies} technologie(s) examinée(s) — ${r.renseignees} complétée(s), `
      + `${r.fraiches} déjà à jour, ${r.manuelles} saisie(s) manuelle(s) préservée(s), `
      // Nommé, et non tu : une technologie qu'endoflife.date ne connaît pas garde une date
      // vide, et une date vide se lit « inconnu ». La taire ferait croire à un support.
      + `${r.sansCorrespondance} inconnue(s) de la source (date à saisir à la main).`
    await refreshParc()
  }
  catch { msg.value = 'La récupération depuis endoflife.date a échoué.' }
  finally { busy.value = false }
}

// --- Les autres populations -----------------------------------------------------------
// La fin de vie ne concerne pas que les systèmes du parc GLPI. Une technologie détectée sur un
// site web a une date de fin de support comme un OS, et personne ne la voyait ici.
type LigneTechno = {
  id: string
  nom: string
  version: string | null
  categorie: string | null
  finDeVie: string | null
  finDeVieEtendue: string | null
  eolStatut: Ligne['eolStatut']
  applications: number
  serveurs: number
  services: number
}

const { data: parc, refresh: refreshParc } = await useAsyncData(
  'eol-parc-technologique',
  () => api<{ resultats: LigneTechno[] }>('/api/technologies/parc'),
  { getCachedData: () => undefined },
)

// L'OS est une catégorie du référentiel comme une autre : l'onglet « Systèmes » le traite
// déjà, et le laisser ici le ferait compter deux fois sous deux vues différentes.
const technos = computed(() => (parc.value?.resultats ?? []).filter(t => t.categorie !== 'os'))
const technosSites = computed(() => technos.value.filter(t => t.services > 0))

/**
 * LES ONGLETS, dérivés d'une seule table. Le libellé, le décompte et le contenu tenaient sinon
 * dans trois endroits différents : ajouter une population sans son compteur donne un onglet qui
 * s'affiche « 0 » en permanence, ce qui se lit « rien à voir ici » et non « rien n'est branché
 * ».
 */
const ONGLETS = computed(() => [
  { k: 'os' as const, l: 'Systèmes d\'exploitation', n: e.value?.lignes.length ?? 0 },
  { k: 'techno' as const, l: 'Technologies', n: technos.value.length },
  { k: 'sites' as const, l: 'Sites et services', n: technosSites.value.length },
])
const onglet = ref<'os' | 'techno' | 'sites'>('os')

// Le même tri partout : ce qui est hors support d'abord, puis le plus répandu.
const usages = (t: LigneTechno) => t.applications + t.serveurs + t.services
const trier = (l: LigneTechno[]) =>
  [...l].sort((a2, b2) => STATUT[a2.eolStatut].ordre - STATUT[b2.eolStatut].ordre || usages(b2) - usages(a2))
const lignesTechno = computed(() =>
  trier(onglet.value === 'sites' ? technosSites.value : technos.value)
    .filter(t => !filtre.value || t.eolStatut === filtre.value))

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Fin de vie
        </UITitle>
        <p
          v-if="onglet === 'os'"
          class="mt-1 text-xs text-secondary-500"
        >
          Sur les fiches de l'inventaire GLPI. Le tableau de bord ne compte que les serveurs et postes.
        </p>
        <p class="mt-1 text-sm text-secondary-600/90">
          {{ onglet === 'os'
            ? 'Les systèmes du parc et leur date de fin de support. Votre saisie prime sur les dates pré-remplies.'
            : onglet === 'sites'
              ? 'Les technologies détectées sur les sites et services exposés, et leur date de fin de support.'
              : 'Les technologies du référentiel hors systèmes, et leur date de fin de support.' }}
        </p>
      </div>
      <div
        v-if="editable && onglet !== 'os'"
        class="flex shrink-0 flex-wrap items-center gap-2"
      >
        <button
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          :disabled="busy"
          @click="enrichir"
        >
          <Icon
            name="lucide:globe"
            class="size-4"
            :class="busy ? 'animate-spin' : ''"
          /> Compléter depuis endoflife.date
        </button>
      </div>
      <div
        v-if="editable && onglet === 'os'"
        class="flex shrink-0 flex-wrap items-center gap-2"
      >
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 disabled:opacity-50"
          :disabled="busy"
          @click="construire"
        >
          <Icon
            name="lucide:database-zap"
            class="size-4"
            :class="busy ? 'animate-spin' : ''"
          />
          {{ e?.resume.referentielConstruit ? 'Actualiser depuis le parc' : 'Construire le référentiel' }}
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          :disabled="busy"
          @click="synchroniser"
        >
          <Icon
            name="lucide:globe"
            class="size-4"
            :class="busy ? 'animate-spin' : ''"
          /> Compléter depuis endoflife.date
        </button>
      </div>
    </header>

    <p
      v-if="msg"
      class="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-sm text-emerald-700"
    >
      {{ msg }}
    </p>

    <!-- LES ONGLETS. Trois populations distinctes : un OS du parc, une technologie déclarée et une technologie détectée en façade ne se migrent pas de la même façon, et leurs totaux ne s'additionnent pas. -->
    <nav class="flex flex-wrap gap-1 border-b border-secondary-200/70">
      <button
        v-for="o in ONGLETS"
        :key="o.k"
        class="-mb-px border-b-2 px-3 py-2 text-sm transition-colors"
        :class="onglet === o.k
          ? 'border-primary-600 font-medium text-primary-700'
          : 'border-transparent text-secondary-500 hover:text-secondary-800'"
        @click="onglet = o.k; filtre = ''"
      >
        {{ o.l }}
        <span class="ml-1 font-mono text-[11px] text-secondary-400">{{ o.n }}</span>
      </button>
    </nav>

    <section
      v-if="onglet === 'os' && !e?.resume.referentielConstruit"
      class="rounded-2xl border border-dashed border-primary-300 bg-primary-50/40 p-8 text-center"
    >
      <Icon
        name="lucide:database-zap"
        class="mx-auto size-6 text-primary-500"
      />
      <p class="mt-2 text-sm text-secondary-700">
        Le référentiel n'est pas encore construit.
      </p>
      <p class="mt-1 text-xs text-secondary-500">
        Un clic analyse les {{ e?.resume.osDistincts ?? 0 }} systèmes du parc, les inscrit au catalogue des technologies et renseigne les dates de fin de support connues.
      </p>
    </section>

    <!-- Résumé : trois chiffres, dont le plus important — ce qu'on ne sait pas. -->
    <section
      v-if="e && onglet === 'os'"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <button
        v-for="t in [
          { k: 'depasse', n: e.resume.machinesDepassees, label: 'machine(s) hors support', tone: 'text-red-600', icon: 'lucide:shield-x' },
          { k: 'bientot', n: e.resume.machinesBientot, label: 'machine(s) en fin de support sous 1 an', tone: 'text-amber-600', icon: 'lucide:alarm-clock' },
          { k: 'etendu', n: e.resume.machinesEtendues, label: 'machine(s) sous support étendu', tone: 'text-blue-600', icon: 'lucide:shield-plus' },
          { k: 'inconnu', n: e.resume.machinesInconnues, label: 'machine(s) sans date connue', tone: 'text-secondary-700', icon: 'lucide:help-circle' },
        ]"
        :key="t.k"
        :class="[TUILE, 'flex items-center gap-3 text-left transition-colors hover:bg-secondary-50/60', filtre === t.k ? 'ring-2 ring-primary-500/30' : '']"
        @click="filtre = filtre === t.k ? '' : t.k as typeof filtre"
      >
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-secondary-100 bg-secondary-50">
          <Icon
            :name="t.icon"
            class="size-5"
            :class="t.tone"
          />
        </span>
        <span class="min-w-0">
          <span
            class="block text-xl font-semibold leading-none tracking-tight"
            :class="t.tone"
          >{{ t.n }}<span
            v-if="e.resume.machinesTotal"
            class="ml-1 text-sm font-normal text-secondary-400"
          >/ {{ e.resume.machinesTotal }}</span></span>
          <!-- LA POPULATION, nommée. Ce total porte sur les fiches d'inventaire GLPI, là où la tuile du tableau de bord compte les serveurs et postes du catalogue. -->
          <!-- Le dénominateur à côté du chiffre : « 412 » et « 412 sur 8 862 » n'appellent
               pas la même décision, et le lecteur ne devrait pas avoir à le chercher. -->
          <span class="mt-1 block text-[13px] leading-tight text-secondary-700">{{ t.label }}</span>
        </span>
      </button>
    </section>

    <p
      v-if="onglet === 'os' && e?.resume.osSansDate"
      class="px-1 text-xs text-secondary-500"
    >
      <Icon
        name="lucide:info"
        class="mr-1 inline size-3.5 align-[-2px] text-secondary-400"
      />
      {{ e.resume.osSansDate }} système(s) n'ont pas de date de fin de support : saisissez-la directement dans la colonne de droite (champ surligné) pour qu'ils soient suivis.
      Tant qu'elle manque, le nombre de machines dépassées est un minorant et non un total.
    </p>

    <section
      v-if="onglet === 'os' && lignes.length"
      :class="[TUILE, 'space-y-1 !p-2']"
    >
      <div
        v-for="l in lignes"
        :key="l.os"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 transition-colors hover:bg-secondary-50"
      >
        <span
          class="inline-flex w-28 shrink-0 items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
          :class="STATUT[l.eolStatut].cls"
        >
          {{ STATUT[l.eolStatut].label }}
        </span>
        <span class="min-w-[12rem] flex-1 truncate text-sm text-secondary-800">{{ l.os }}</span>
        <span
          v-if="!editable"
          class="shrink-0 font-mono text-[11px] text-secondary-400"
        >
          <template v-if="l.finDeVie">fin {{ l.finDeVie }}</template>
          <template v-else>—</template>
        </span>
        <span
          v-else
          class="flex shrink-0 items-center gap-1"
        >
          <input
            :value="brouillon.get(l.os) ?? l.finDeVie ?? ''"
            type="date"
            class="w-36 rounded-md border border-secondary-200/80 bg-secondary-50/30 px-2 py-1 font-mono text-[11px] outline-none transition-colors focus:border-primary-400 focus:bg-white"
            :class="!l.finDeVie ? 'border-amber-300 bg-amber-50/40' : ''"
            :disabled="enregistrement === l.os"
            @input="brouillon.set(l.os, ($event.target as HTMLInputElement).value)"
            @change="enregistrerDate(l)"
          >
          <Icon
            v-if="enregistrement === l.os"
            name="lucide:loader-circle"
            class="size-3.5 animate-spin text-secondary-300"
          />
        </span>
        <span class="w-20 shrink-0 text-right font-mono text-xs font-semibold text-secondary-600">{{ l.machines }}</span>
      </div>
    </section>

    <section
      v-if="onglet !== 'os' && lignesTechno.length"
      :class="[TUILE, 'space-y-1 !p-2']"
    >
      <div
        v-for="t in lignesTechno"
        :key="t.id"
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 transition-colors hover:bg-secondary-50"
      >
        <span
          class="inline-flex w-28 shrink-0 items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
          :class="STATUT[t.eolStatut].cls"
        >
          {{ STATUT[t.eolStatut].label }}
        </span>
        <span class="min-w-[12rem] flex-1 truncate text-sm text-secondary-800">
          {{ t.nom }}<span
            v-if="t.version"
            class="ml-1 font-mono text-xs text-secondary-500"
          >{{ t.version }}</span>
        </span>
        <span class="shrink-0 font-mono text-[11px] text-secondary-400">
          <template v-if="t.finDeVieEtendue">étendu {{ t.finDeVieEtendue }}</template>
          <template v-else-if="t.finDeVie">fin {{ t.finDeVie }}</template>
          <template v-else>—</template>
        </span>
        <!-- OÙ elle tourne. « PHP 8.2 hors support » n'engage personne ; « sur 4 sites » désigne le travail. -->
        <span class="w-40 shrink-0 text-right text-[11px] text-secondary-500">
          <template v-if="usages(t)">
            {{ [
              t.services ? `${t.services} site${t.services > 1 ? 's' : ''}` : '',
              t.serveurs ? `${t.serveurs} serveur${t.serveurs > 1 ? 's' : ''}` : '',
              t.applications ? `${t.applications} application${t.applications > 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(' · ') }}
          </template>
          <template v-else>
            <span class="text-secondary-300">aucun usage connu</span>
          </template>
        </span>
      </div>
    </section>

    <p
      v-if="onglet !== 'os' && !lignesTechno.length"
      class="rounded-2xl border border-dashed border-secondary-200 p-8 text-center text-sm text-secondary-500"
    >
      {{ onglet === 'sites'
        ? 'Aucune technologie détectée sur les sites n\'est rapprochée du référentiel. Lancez un relevé depuis Sites et services.'
        : 'Aucune technologie hors systèmes dans le référentiel.' }}
    </p>

    <p
      v-if="onglet === 'os'"
      class="text-center text-xs text-secondary-400"
    >
      Dates pré-remplies depuis une table interne, modifiables ici. Une reconstruction n'écrase jamais une saisie du référentiel. Un support étendu (ESU, ESM) décale la date réelle.
    </p>
  </div>
</template>
