<script setup lang="ts">
// CONTENU D'UN MOTEUR DE DÉTECTION — une page par moteur, un seul composant.
import Pill from '~/components/ui/Pill.vue'

type Regle = {
  id: string
  harfanglabId: string
  nom: string | null
  description: string | null
  contenu: string | null
  typeIndicateur: string | null
  valeur: string | null
  actif: boolean | null
  etat: string | null
  etatEffectif: string | null
  sourceNom: string | null
  fourniParEditeur: boolean | null
  rulesets: { id: string, nom: string | null }[] | null
  dateMaj: string | null
  vuAuSync: string | null
}
type Page = {
  total: number
  depart: number
  limite: number
  tri: string
  resultats: Regle[]
}

const MOTEURS: Record<string, { titre: string, sous: string, icone: string, corps: boolean }> = {
  yara: {
    titre: 'YARA',
    // Distinction réelle de l'outil, pas un détail : l'API n'expose pas de « règle »
    // YARA. Compter les lignes de cette page ne donne donc PAS un nombre de règles.
    sous: 'Fichiers `.yar`. HarfangLab n\'expose pas de règle YARA à l\'unité : un fichier en porte plusieurs.',
    icone: 'lucide:file-code',
    corps: true,
  },
  sigma: { titre: 'Sigma', sous: 'Règles de détection sur les journaux, au format YAML.', icone: 'lucide:file-search', corps: true },
  ioc: { titre: 'IOC', sous: 'Indicateurs de compromission : empreintes, chemins, domaines.', icone: 'lucide:fingerprint', corps: false },
  correlation: { titre: 'Corrélation', sous: 'Règles qui rapprochent plusieurs évènements pour en faire une détection.', icone: 'lucide:git-merge', corps: true },
  driverblock: {
    titre: 'Driver blocklist',
    // Particularité de l'outil qu'il vaut mieux annoncer que laisser découvrir.
    sous: 'Pilotes bloqués. Famille de routes distincte : les jeux de règles de l\'EDR ne connaissent pas ce moteur.',
    icone: 'lucide:shield-x',
    corps: false,
  },
}

const route = useRoute()
const api = useApi()
const moteur = computed(() => String(route.params.moteur ?? ''))
const meta = computed(() => MOTEURS[moteur.value])

if (!MOTEURS[moteur.value]) throw createError({ statusCode: 404, statusMessage: 'Moteur de détection inconnu' })

const q = ref('')
const actif = ref('')
const origine = ref('')
const depart = ref(0)
const LIMITE = 50

const params = computed(() => ({
  q: q.value || undefined,
  actif: actif.value || undefined,
  origine: origine.value || undefined,
  limite: String(LIMITE),
  depart: String(depart.value),
}))

const { data, refresh, status } = await useAsyncData(
  () => `edr-${moteur.value}-${JSON.stringify(params.value)}`,
  () => api<Page>(`/api/edr/regles/${moteur.value}`, { query: params.value }),
  { watch: [moteur, params] },
)

watch([q, actif, origine], () => {
  depart.value = 0
})

const ouvert = ref<string | null>(null)
const bascule = (id: string) => {
  ouvert.value = ouvert.value === id ? null : id
}

const dateFr = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—')

// Fraîcheur : l'âge de ce qu'on affiche. Une donnée de six mois présentée avec le même
// aplomb qu'une donnée du matin est un piège.
const fraicheur = computed(() => {
  const v = data.value?.resultats?.[0]?.vuAuSync
  if (!v) return null
  const jours = Math.floor((Date.now() - new Date(v).getTime()) / 864e5)
  return jours <= 0 ? 'aujourd\'hui' : jours === 1 ? 'hier' : `il y a ${jours} jours`
})

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="flex items-center gap-2 tracking-tight text-secondary-900">
        <Icon
          :name="meta!.icone"
          class="size-5 text-primary-500"
        />
        {{ meta!.titre }}
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        {{ meta!.sous }}
      </p>
    </header>

    <section :class="[TUILE, '!p-4 space-y-3']">
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="q"
          :class="[CHAMP, 'min-w-64 flex-1']"
          :placeholder="meta!.corps ? 'Chercher dans le nom, la description ET le corps des règles…' : 'Chercher un nom, une valeur…'"
        >
        <select
          v-model="actif"
          :class="CHAMP"
        >
          <option value="">
            Tous les états
          </option>
          <option value="true">
            Actives
          </option>
          <option value="false">
            Inactives
          </option>
        </select>
        <select
          v-model="origine"
          :class="CHAMP"
        >
          <option value="">
            Toutes origines
          </option>
          <option value="etablissement">
            Écrites par l'établissement
          </option>
          <option value="editeur">
            Fournies par HarfangLab
          </option>
        </select>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
          @click="refresh()"
        >
          <Icon
            name="lucide:refresh-cw"
            class="size-4"
          />
        </button>
      </div>

      <p class="flex flex-wrap items-baseline gap-x-3 text-xs text-secondary-500">
        <span><strong class="text-secondary-800">{{ data?.total ?? 0 }}</strong> {{ moteur === 'yara' ? 'fichier(s)' : 'règle(s)' }}</span>
        <span
          v-if="fraicheur"
          class="text-secondary-400"
        >· relevé {{ fraicheur }}</span>
        <span class="text-secondary-400">· trié par {{ data?.tri }}</span>
      </p>
    </section>

    <p
      v-if="status !== 'pending' && !data?.resultats?.length"
      :class="[TUILE, 'text-sm text-secondary-500']"
    >
      Rien à afficher. Si aucune synchronisation HarfangLab n'a encore eu lieu, ce vide ne
      veut rien dire — lancez-en une depuis le connecteur.
    </p>

    <div class="space-y-2">
      <article
        v-for="r in data?.resultats ?? []"
        :key="r.id"
        class="rounded-xl border border-secondary-200/60 bg-white transition-colors hover:border-secondary-300/70"
      >
        <button
          class="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
          @click="bascule(r.id)"
        >
          <Icon
            :name="ouvert === r.id ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="size-4 shrink-0 text-secondary-400"
          />
          <span class="font-medium tracking-tight text-secondary-900">{{ r.nom ?? r.valeur ?? r.harfanglabId }}</span>

          <Pill
            v-if="r.typeIndicateur"
            tone="gray"
          >
            {{ r.typeIndicateur }}
          </Pill>
          <Pill
            v-if="r.actif === false"
            tone="red"
          >
            Inactive
          </Pill>
          <!-- L'API expose `state`, `global_state` et `effective_state` sans dire lequel
               prime. On montre l'« effectif », le seul dont le nom affirme quelque chose. -->
          <Pill
            v-else-if="r.etatEffectif"
            tone="gray"
          >
            {{ r.etatEffectif }}
          </Pill>
          <Pill
            v-if="r.fourniParEditeur === false"
            tone="blue"
          >
            Établissement
          </Pill>

          <span class="ml-auto shrink-0 font-mono text-[10px] text-secondary-400">{{ dateFr(r.dateMaj) }}</span>
        </button>

        <div
          v-if="ouvert === r.id"
          class="space-y-3 border-t border-secondary-200/60 px-4 py-3"
        >
          <p
            v-if="r.description"
            class="text-sm text-secondary-600"
          >
            {{ r.description }}
          </p>

          <dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <div v-if="r.valeur">
              <dt class="font-mono text-[10px] uppercase tracking-widest text-secondary-400">
                Valeur
              </dt>
              <dd class="break-all font-mono text-secondary-800">
                {{ r.valeur }}
              </dd>
            </div>
            <div v-if="r.sourceNom">
              <dt class="font-mono text-[10px] uppercase tracking-widest text-secondary-400">
                Source
              </dt>
              <dd class="text-secondary-800">
                {{ r.sourceNom }}
              </dd>
            </div>
            <div v-if="r.rulesets?.length">
              <dt class="font-mono text-[10px] uppercase tracking-widest text-secondary-400">
                Jeux de règles
              </dt>
              <dd class="text-secondary-800">
                {{ r.rulesets.map(x => x.nom ?? x.id).join(', ') }}
              </dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-widest text-secondary-400">
                Identifiant EDR
              </dt>
              <dd class="break-all font-mono text-[10px] text-secondary-500">
                {{ r.harfanglabId }}
              </dd>
            </div>
          </dl>

          <pre
            v-if="r.contenu"
            class="max-h-96 overflow-auto rounded-lg border border-secondary-200/60 bg-secondary-50/50 p-3 font-mono text-[11px] leading-relaxed text-secondary-800"
          >{{ r.contenu }}</pre>
          <p
            v-else-if="meta!.corps"
            class="text-xs text-secondary-400"
          >
            Corps non renvoyé par l'API pour cette règle.
          </p>
        </div>
      </article>
    </div>

    <div
      v-if="(data?.total ?? 0) > LIMITE"
      class="flex items-center justify-between text-sm"
    >
      <button
        class="rounded-lg border border-secondary-200/80 px-3 py-1.5 disabled:opacity-40"
        :disabled="depart === 0"
        @click="depart = Math.max(0, depart - LIMITE)"
      >
        Précédent
      </button>
      <span class="text-xs text-secondary-500">{{ depart + 1 }}–{{ Math.min(depart + LIMITE, data!.total) }} sur {{ data!.total }}</span>
      <button
        class="rounded-lg border border-secondary-200/80 px-3 py-1.5 disabled:opacity-40"
        :disabled="depart + LIMITE >= (data?.total ?? 0)"
        @click="depart = depart + LIMITE"
      >
        Suivant
      </button>
    </div>
  </div>
</template>
