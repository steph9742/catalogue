<script setup lang="ts">
// COUVERTURE EDR D'UNE UNITÉ D'ORGANISATION. « 217 machines critiques sans agent » n'engage
// personne.
const props = defineProps<{
  niveau: 'entite' | 'composante' | 'service' | 'departement'
  id: string
}>()

const api = useApi()

type Compteurs = {
  critiques: number
  avecAgent: number
  sansAgent: number
  ambigus: number
  nonCritiques: number
  nonCritiquesAvecAgent: number
  nonCritiquesSansAgent: number
  nonCritiquesAmbigus: number
  agentsHorsGlpi: number
}
type LigneComposante = Compteurs & { composanteId: string | null, nom: string, entiteId: string | null }
type LigneSousUnite = Compteurs & { id: string | null, nom: string, niveau: 'service' | 'departement', composanteId: string | null }
type LignePole = Compteurs & { id: string | null, nom: string, sousUniteId: string | null, sousUniteNiveau: 'service' | 'departement', composanteId: string | null }
type Couverture = {
  dernierSyncAt: string | null
  dernierStatut: string
  reglesDeclarees: number
  lignes: LigneComposante[]
  sousUnites: LigneSousUnite[]
  poles: LignePole[]
  agents?: { total: number, sansMachineGlpi: number, sansMachineGlpiRattaches?: number }
  agentsSansMachineGlpi?: { agentId: string, hostname: string | null }[]
}

// CLÉ FIXE, volontairement sans l'unité : la réponse est la même pour tout le monde, et une clé
// par fiche referait le rapprochement complet du parc à chaque navigation.
const { data: couverture } = await useAsyncData(
  'edr-couverture-par-composante',
  () => api<Couverture>('/api/harfanglab/couverture/par-composante').catch(() => null),
)

const CHAMPS: (keyof Compteurs)[] = ['critiques', 'avecAgent', 'sansAgent', 'ambigus', 'nonCritiques', 'nonCritiquesAvecAgent', 'nonCritiquesSansAgent', 'nonCritiquesAmbigus', 'agentsHorsGlpi']

/**
 * Le pourcentage de `n` sur `total`, ou `null` s'il ne veut rien dire. `tranches` est le nombre
 * de machines dont le sort est établi.
 */
function part(n: number, tranches: number, total: number): number | null {
  return total && tranches ? Math.round((n / total) * 100) : null
}

const unite = computed(() => {
  const c = couverture.value
  if (!c) return null

  const propres: Compteurs[] = props.niveau === 'entite'
    ? c.lignes.filter(x => x.entiteId === props.id)
    : props.niveau === 'composante'
      ? c.lignes.filter(x => x.composanteId === props.id)
      // Filtré sur le niveau AUTANT que sur l'identifiant : un service et un département ne
      // partagent pas d'identifiant aujourd'hui, et s'appuyer là-dessus serait parier sur une
      // propriété que rien ne garantit.
      : c.sousUnites.filter(x => x.id === props.id && x.niveau === props.niveau)
  if (!propres.length) return null

  const t = Object.fromEntries(CHAMPS.map(k => [k, propres.reduce((n, x) => n + (x[k] ?? 0), 0)])) as Compteurs

  return {
    ...t,
    // LE POURCENTAGE PORTE SUR SON PARC, dénominateur affiché juste à côté. TU QUAND RIEN N'EST
    // TRANCHÉ.
    partCritiques: part(t.sansAgent, t.avecAgent + t.sansAgent, t.critiques),
    partNonCritiques: part(t.nonCritiquesSansAgent, t.nonCritiquesAvecAgent + t.nonCritiquesSansAgent, t.nonCritiques),
    // LE CRAN EN DESSOUS. Sur l'entité, ses composantes ; sur une composante, ses services et
    // départements ; sur un service ou un département, ses pôles.
    detail: props.niveau === 'entite'
      ? c.lignes.filter(x => x.entiteId === props.id).map(x => ({ ...x, note: '' }))
      : props.niveau === 'composante'
        ? c.sousUnites.filter(x => x.composanteId === props.id)
            .map(x => ({ ...x, note: x.niveau === 'departement' ? 'département' : 'service' }))
        : (c.poles ?? []).filter(x => x.sousUniteId === props.id && x.sousUniteNiveau === props.niveau)
            .map(x => ({ ...x, note: '' })),
  }
})

const pourcent = (n: number, avec: number, total: number) => {
  const p = part(n, avec + n, total)
  return p === null ? '—' : `${p} %`
}

const TUILE = 'rounded-xl border px-3 py-2'
const NEUTRE = 'border-secondary-100 bg-secondary-50/40'
</script>

<template>
  <section
    v-if="unite"
    class="rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-sm font-semibold tracking-tight text-secondary-900">
        Couverture EDR du parc GLPI
      </h2>
      <NuxtLink
        to="/harfanglab"
        class="text-xs text-secondary-500 underline underline-offset-2 hover:text-secondary-800"
      >
        Connecteur HarfangLab
      </NuxtLink>
    </div>
    <p class="mt-0.5 text-xs text-secondary-500">
      Machines GLPI de l'unité confrontées aux agents EDR qui remontent. « Critique » : machine dont le groupe GLPI est déclaré critique.
    </p>

    <!-- L'ORDRE PORTE DU SENS : le parc concerné, puis ce qui manque, puis ce qui est
         couvert. Le parc critique d'abord, parce que c'est lui qui DOIT être couvert. -->
    <h3 class="mt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
      Parc critique GLPI
    </h3>
    <div class="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div :class="[TUILE, NEUTRE]">
        <span class="block text-2xl font-semibold leading-none tracking-tight tabular-nums text-secondary-800">{{ unite.critiques }}</span>
        <span class="mt-1 block text-[11px] leading-tight text-secondary-600">machines critiques GLPI</span>
      </div>
      <div :class="[TUILE, unite.sansAgent ? 'border-red-200 bg-red-50/50' : NEUTRE]">
        <span
          class="block text-2xl font-semibold leading-none tracking-tight tabular-nums"
          :class="unite.sansAgent ? 'text-red-600' : 'text-secondary-400'"
        >{{ unite.sansAgent }}<span
          v-if="unite.partCritiques !== null"
          class="ml-1.5 text-sm font-normal"
        >{{ unite.partCritiques }} %</span></span>
        <span class="mt-1 block text-[11px] leading-tight text-secondary-600">machines critiques GLPI sans agent EDR</span>
      </div>
      <div :class="[TUILE, NEUTRE]">
        <span class="block text-2xl font-semibold leading-none tracking-tight tabular-nums text-emerald-600">{{ unite.avecAgent }}</span>
        <span class="mt-1 block text-[11px] leading-tight text-secondary-600">machines critiques GLPI avec agent EDR</span>
      </div>
    </div>

    <h3 class="mt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
      Parc GLPI non critique
    </h3>
    <div class="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div :class="[TUILE, NEUTRE]">
        <span class="block text-2xl font-semibold leading-none tracking-tight tabular-nums text-secondary-800">{{ unite.nonCritiques }}</span>
        <span class="mt-1 block text-[11px] leading-tight text-secondary-600">machines GLPI non critiques</span>
      </div>
      <div :class="[TUILE, NEUTRE]">
        <span class="block text-2xl font-semibold leading-none tracking-tight tabular-nums text-secondary-800">{{ unite.nonCritiquesSansAgent }}<span
          v-if="unite.partNonCritiques !== null"
          class="ml-1.5 text-sm font-normal text-secondary-500"
        >{{ unite.partNonCritiques }} %</span></span>
        <span class="mt-1 block text-[11px] leading-tight text-secondary-600">machines GLPI non critiques sans agent EDR</span>
      </div>
      <div :class="[TUILE, NEUTRE]">
        <span class="block text-2xl font-semibold leading-none tracking-tight tabular-nums text-emerald-600">{{ unite.nonCritiquesAvecAgent }}</span>
        <span class="mt-1 block text-[11px] leading-tight text-secondary-600">machines GLPI non critiques avec agent EDR</span>
      </div>
    </div>

    <!-- LES AGENTS EDR SANS MACHINE GLPI, placés dans l'unité par leur entité HarfangLab (information additionnelle 1). -->
    <h3 class="mt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
      Agents EDR hors GLPI
    </h3>
    <div class="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div :class="[TUILE, unite.agentsHorsGlpi ? 'border-amber-200 bg-amber-50/50' : NEUTRE]">
        <span
          class="block text-2xl font-semibold leading-none tracking-tight tabular-nums"
          :class="unite.agentsHorsGlpi ? 'text-amber-700' : 'text-secondary-400'"
        >{{ unite.agentsHorsGlpi }}</span>
        <span class="mt-1 block text-[11px] leading-tight text-secondary-600">agents EDR sans machine GLPI, rattachés à l'unité par leur entité EDR</span>
      </div>
    </div>
    <!-- Sur l'établissement, la part que l'entité EDR n'a pas pu placer : elle est sur la
         ligne « (entité EDR non rattachée) », et se corrige dans les réglages du connecteur. -->
    <p
      v-if="niveau === 'entite' && couverture?.agents"
      class="mt-2 text-xs text-secondary-600"
    >
      {{ couverture.agents.sansMachineGlpi }} agent(s) EDR sans machine GLPI sur {{ couverture.agents.total }} agents,
      dont {{ couverture.agents.sansMachineGlpiRattaches ?? 0 }} rattaché(s) à une unité par leur entité EDR. Les autres figurent
      sur les lignes « (entité EDR non rattachée) » et « (agent EDR sans entité) » ; le rattachement se déclare sur la page du
      connecteur HarfangLab.
    </p>

    <!-- LES AMBIGUS DISENT CE QUE VALENT LES AUTRES. Un rapprochement non tranché n'est ni
         une couverture ni un écart : le taire ferait passer une incertitude pour une mesure. -->
    <p
      v-if="unite.ambigus || unite.nonCritiquesAmbigus"
      class="mt-2 text-xs text-amber-700"
    >
      {{ unite.ambigus }} machine(s) critique(s) et {{ unite.nonCritiquesAmbigus }} machine(s) non critique(s) n'ont pas pu être
      rapprochées de façon certaine d'un agent : elles ne comptent ni « avec agent EDR », ni « sans agent EDR ».
    </p>
    <p
      v-if="couverture && !couverture.reglesDeclarees"
      class="mt-2 text-xs text-secondary-600"
    >
      Aucun groupe GLPI n'est déclaré critique : tout le parc est compté non critique tant que la correspondance
      n'est pas renseignée sur le connecteur GLPI.
    </p>

    <!-- LE DÉTAIL, une ligne par unité du cran en dessous : c'est lui qui désigne un
         interlocuteur. Un tableau à en-têtes, pour que chaque colonne dise ce qu'elle compte. -->
    <div
      v-if="unite.detail.length > 1"
      class="mt-3 overflow-x-auto border-t border-secondary-100 pt-3"
    >
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-[11px] text-secondary-500">
            <th class="py-1 pr-3 font-medium">
              Unité
            </th>
            <th class="py-1 pr-3 text-right font-medium">
              Critiques GLPI
            </th>
            <th class="py-1 pr-3 text-right font-medium">
              Critiques sans agent EDR
            </th>
            <th class="py-1 pr-3 text-right font-medium">
              Non critiques GLPI
            </th>
            <th class="py-1 pr-3 text-right font-medium">
              Non critiques sans agent EDR
            </th>
            <th class="py-1 pr-3 text-right font-medium">
              Non critiques avec agent EDR
            </th>
            <th class="py-1 text-right font-medium">
              Agents EDR hors GLPI
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in unite.detail"
            :key="d.nom + d.note"
            class="border-t border-secondary-100 hover:bg-secondary-50"
          >
            <td class="max-w-64 truncate py-1.5 pr-3 text-secondary-800">
              {{ d.nom }}<span
                v-if="d.note"
                class="ml-1.5 text-[11px] text-secondary-400"
              >{{ d.note }}</span>
            </td>
            <td class="py-1.5 pr-3 text-right tabular-nums text-secondary-600">
              {{ d.critiques }}
            </td>
            <td
              class="py-1.5 pr-3 text-right tabular-nums"
              :class="d.sansAgent ? 'font-semibold text-red-600' : 'text-secondary-400'"
            >
              {{ d.sansAgent }} <span class="text-[11px] font-normal">{{ pourcent(d.sansAgent, d.avecAgent, d.critiques) }}</span>
            </td>
            <td class="py-1.5 pr-3 text-right tabular-nums text-secondary-600">
              {{ d.nonCritiques }}
            </td>
            <td class="py-1.5 pr-3 text-right tabular-nums text-secondary-600">
              {{ d.nonCritiquesSansAgent }} <span class="text-[11px] text-secondary-400">{{ pourcent(d.nonCritiquesSansAgent, d.nonCritiquesAvecAgent, d.nonCritiques) }}</span>
            </td>
            <td class="py-1.5 pr-3 text-right tabular-nums text-emerald-700">
              {{ d.nonCritiquesAvecAgent }}
            </td>
            <td
              class="py-1.5 text-right tabular-nums"
              :class="d.agentsHorsGlpi ? 'text-amber-700' : 'text-secondary-300'"
            >
              {{ d.agentsHorsGlpi }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
