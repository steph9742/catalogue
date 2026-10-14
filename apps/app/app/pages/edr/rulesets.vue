<script setup lang="ts">
// JEUX DE RÈGLES DE L'EDR. La question à laquelle cette page répond : un jeu de règles
// soigneusement constitué est-il rattaché à une politique ?
import Pill from '~/components/ui/Pill.vue'

type Ruleset = {
  id: string
  rulesetId: string
  moteur: string
  nom: string
  description: string | null
  actif: boolean | null
  detectionPoste: boolean | null
  blocageAgent: boolean | null
  quarantaineAgent: boolean | null
  compteurs: Record<string, number> | null
  politiques: { id: string, nom: string | null }[] | null
  dateMaj: string | null
}
type Liste = {
  total: number
  tri: string
  resultats: Ruleset[]
}
type Resume = {
  parMoteur: {
    moteur: string
    total: number
    actives: number
    inactives: number
    etablissement: number
    avecContenu: number
  }[]
  rulesets: number
  rulesetsSansPolitique: number
}

const api = useApi()
const sansPolitique = ref(false)

const [{ data: liste }, { data: resume }] = await Promise.all([
  useAsyncData('edr-rulesets', () => api<Liste>('/api/edr/rulesets')),
  useAsyncData('edr-resume', () => api<Resume>('/api/edr/resume')),
])

const LIBELLE_MOTEUR: Record<string, string> = {
  yara: 'YARA', sigma: 'Sigma', ioc: 'IOC', correlation: 'Corrélation', driverblock: 'Driver blocklist',
}

const visibles = computed(() => {
  const rows = liste.value?.resultats ?? []
  return sansPolitique.value ? rows.filter(r => !r.politiques?.length) : rows
})

const dateFr = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—')

const ouvert = ref<string | null>(null)
const basculer = (id: string) => {
  ouvert.value = ouvert.value === id ? null : id
}

// Les compteurs de l'API portent des clés techniques : on les rend lisibles sans les
// interpréter. Une clé inconnue s'affiche telle quelle plutôt que d'être masquée.
const LIBELLE_COMPTEUR: Record<string, string> = {
  alert: 'Règles qui alertent',
  block: 'Règles qui bloquent',
  quarantine: 'Règles qui mettent en quarantaine',
  disabled: 'Règles désactivées',
  default: 'Règles au comportement par défaut',
}

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="flex items-center gap-2 tracking-tight text-secondary-900">
        <Icon
          name="lucide:layers"
          class="size-5 text-primary-500"
        />
        Jeux de règles
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Jeux de règles définis dans l'EDR et politiques auxquelles ils sont rattachés. Un jeu sans
        politique rattachée n'est appliqué sur aucun poste.
      </p>
    </header>

    <!-- Le contenu de chaque moteur, en un coup d'œil. -->
    <section
      v-if="resume?.parMoteur?.length"
      class="grid grid-cols-2 gap-3 sm:grid-cols-5"
    >
      <NuxtLink
        v-for="m in resume.parMoteur"
        :key="m.moteur"
        :to="`/edr/${m.moteur}`"
        class="rounded-xl border border-secondary-200/70 bg-white p-3 transition-colors hover:border-primary-300"
      >
        <span class="block text-xl font-semibold leading-none tracking-tight text-secondary-900">{{ m.total }}</span>
        <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ LIBELLE_MOTEUR[m.moteur] ?? m.moteur }}</span>
        <span
          v-if="m.inactives"
          class="mt-1 block text-[10px] text-amber-700"
        >{{ m.inactives }} inactive(s)</span>
      </NuxtLink>
    </section>

    <!-- Le chiffre qui appelle une décision. -->
    <button
      v-if="resume"
      class="block w-full rounded-2xl border p-4 text-left transition-colors"
      :class="resume.rulesetsSansPolitique
        ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
        : 'border-secondary-200/60 bg-white hover:bg-secondary-50/50'"
      @click="sansPolitique = !sansPolitique"
    >
      <span class="text-sm">
        <strong :class="resume.rulesetsSansPolitique ? 'text-amber-900' : 'text-secondary-900'">
          {{ resume.rulesetsSansPolitique }}
        </strong>
        jeu(x) de règles sur {{ resume.rulesets }} ne sont rattachés à <strong>aucune politique</strong>.
        <span class="text-secondary-500">{{ sansPolitique ? '— filtre actif, cliquer pour tout revoir' : '' }}</span>
      </span>
    </button>

    <div class="space-y-2">
      <article
        v-for="r in visibles"
        :key="r.id"
        class="rounded-xl border border-secondary-200/60 bg-white px-4 py-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="flex items-center gap-1.5 text-left"
            :aria-expanded="ouvert === r.id"
            @click="basculer(r.id)"
          >
            <Icon
              :name="ouvert === r.id ? 'lucide:chevron-down' : 'lucide:chevron-right'"
              class="size-4 shrink-0 text-secondary-400"
            />
            <span class="font-medium tracking-tight text-secondary-900">{{ r.nom }}</span>
          </button>
          <Pill tone="gray">
            {{ LIBELLE_MOTEUR[r.moteur] ?? r.moteur }}
          </Pill>
          <Pill
            v-if="r.actif === false"
            tone="red"
          >
            Désactivé
          </Pill>
          <Pill
            v-if="!r.politiques?.length"
            tone="amber"
          >
            Aucune politique
          </Pill>
          <Pill
            v-if="r.blocageAgent"
            tone="blue"
          >
            Bloque
          </Pill>
          <Pill
            v-if="r.quarantaineAgent"
            tone="blue"
          >
            Met en quarantaine
          </Pill>
          <span class="ml-auto font-mono text-[10px] text-secondary-400">{{ dateFr(r.dateMaj) }}</span>
        </div>

        <p
          v-if="r.description"
          class="mt-1 text-sm text-secondary-600"
        >
          {{ r.description }}
        </p>

        <p
          v-if="r.compteurs && Object.keys(r.compteurs).length"
          class="mt-1.5 flex flex-wrap gap-x-4 font-mono text-[10px] text-secondary-500"
        >
          <span
            v-for="(v, k) in r.compteurs"
            :key="k"
          >{{ k }} : <strong class="text-secondary-700">{{ v }}</strong></span>
        </p>

        <p
          v-if="r.politiques?.length"
          class="mt-1.5 text-[11px] text-secondary-500"
        >
          Politiques : {{ r.politiques.map(p => p.nom ?? p.id).join(', ') }}
        </p>

        <!-- FICHE. Composition du jeu de règles, et où il se modifie. -->
        <div
          v-if="ouvert === r.id"
          class="mt-3 space-y-3 border-t border-secondary-200/60 pt-3"
        >
          <div v-if="r.compteurs && Object.keys(r.compteurs).length">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
              Composition
            </p>
            <dl class="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-3">
              <div
                v-for="(v, k) in r.compteurs"
                :key="k"
                class="flex items-baseline justify-between gap-2 border-b border-secondary-100 py-0.5"
              >
                <dt class="text-secondary-500">
                  {{ LIBELLE_COMPTEUR[k] ?? k }}
                </dt>
                <dd class="font-mono font-semibold text-secondary-800">
                  {{ v }}
                </dd>
              </div>
            </dl>
          </div>

          <dl class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-4">
            <div>
              <dt class="text-secondary-400">
                Détection sur le poste
              </dt>
              <dd class="text-secondary-800">
                {{ r.detectionPoste === null ? 'non renseigné' : r.detectionPoste ? 'activée' : 'désactivée' }}
              </dd>
            </div>
            <div>
              <dt class="text-secondary-400">
                Blocage sur l'agent
              </dt>
              <dd class="text-secondary-800">
                {{ r.blocageAgent === null ? 'non renseigné' : r.blocageAgent ? 'activé' : 'désactivé' }}
              </dd>
            </div>
            <div>
              <dt class="text-secondary-400">
                Mise en quarantaine
              </dt>
              <dd class="text-secondary-800">
                {{ r.quarantaineAgent === null ? 'non renseigné' : r.quarantaineAgent ? 'activée' : 'désactivée' }}
              </dd>
            </div>
            <div>
              <dt class="text-secondary-400">
                Identifiant EDR
              </dt>
              <dd class="break-all font-mono text-[10px] text-secondary-500">
                {{ r.rulesetId }}
              </dd>
            </div>
          </dl>

          <div class="rounded-lg border border-secondary-200/70 bg-secondary-50/50 px-3 py-2">
            <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
              Modification
            </p>
            <p class="mt-1 text-[11px] text-secondary-700">
              <strong>HarfangLab, console de l'éditeur</strong> — composition du jeu, rattachement aux
              politiques et comportement des règles. Le Catalogue en tient un inventaire en lecture et
              n'écrit pas dans l'EDR.
            </p>
          </div>

          <p
            v-if="!r.politiques?.length"
            class="text-[11px] text-amber-700"
          >
            Ce jeu de règles n'est rattaché à aucune politique : il n'est appliqué sur aucun poste.
          </p>
        </div>
      </article>

      <p
        v-if="!visibles.length"
        :class="[TUILE, 'text-sm text-secondary-500']"
      >
        Aucun jeu de règles relevé. En l'absence de relevé abouti, cette absence n'est pas
        interprétable.
      </p>
    </div>
  </div>
</template>
