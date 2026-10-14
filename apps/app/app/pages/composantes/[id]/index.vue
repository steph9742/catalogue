<script setup lang="ts">
// Fiche composante = PAGE PIVOT. La navigation de l'app est verticale (par type d'objet) ; ici
// on regarde le SI par périmètre — « qu'est-ce que j'ai à l'IUT NFC ?

const api = useApi()
const route = useRoute()
const perms = await usePermissions()
if (!perms.canRead('composantes')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

type Bloc = { cle: string, label: string, icon: string, base: string, data: { total: number, items: { id: string, nom: string }[] } }
type Perimetre = {
  composante: { id: string, nom: string, sigle: string | null, type: string | null, entite: string | null }
  blocs: Bloc[]
  total: number
  limite: number
  posture: { aClasser: number, obsoletes: number, serveursHorsGlpi: number }
}

const id = computed(() => String(route.params.id))
const { data: p } = await useAsyncData(`composante-${id.value}`, () => api<Perimetre>(`/api/composantes/${id.value}/perimetre`), { getCachedData: () => undefined })

// LE NOM DE L'UNITÉ DANS L'ONGLET : le titre dérivé du menu nomme l'axe (« Services »),
// pas l'unité ouverte — et une fiche de périmètre se consulte à plusieurs onglets.
useHead({ title: () => p.value?.composante.nom })

const editable = computed(() => perms.canWrite('composantes'))

// --- Référents cyber -----------------------------------------------------------------
type Referent = { id: string, personneId: string, role: 'informaticien_proximite' | 'cssi', nom: string | null, email: string | null }
type Personne = { id: string, prenom: string | null, nom: string | null }
const ROLES = [
  { value: 'informaticien_proximite', label: 'Informaticien de proximité', icon: 'lucide:wrench' },
  { value: 'cssi', label: 'CSSI', icon: 'lucide:shield-check' },
] as const

const { data: referents, refresh: refreshReferents } = await useAsyncData(
  `composante-referents-${id.value}`,
  () => api<Referent[]>(`/api/composantes/${id.value}/referents`),
  { getCachedData: () => undefined },
)
const { data: personnes } = await useAsyncData('composante-personnes', () => api<Personne[]>('/api/personnes'), { getCachedData: () => undefined })
const nomPersonne = (x: Personne) => [x.prenom, x.nom].filter(Boolean).join(' ') || x.id
const parRole = (role: string) => (referents.value ?? []).filter(r => r.role === role)

const ajout = reactive({ personneId: '', role: 'informaticien_proximite' as Referent['role'] })
const busyRef = ref(false)
const ajouterReferent = async () => {
  if (!ajout.personneId || busyRef.value) return
  busyRef.value = true
  try {
    await api(`/api/composantes/${id.value}/referents`, { method: 'POST', body: { personneId: ajout.personneId, role: ajout.role } })
    ajout.personneId = ''
    await refreshReferents()
  }
  finally { busyRef.value = false }
}
const retirerReferent = async (r: Referent) => {
  if (busyRef.value) return
  busyRef.value = true
  try {
    await api(`/api/composante-referent/${r.id}`, { method: 'DELETE' })
    await refreshReferents()
  }
  finally { busyRef.value = false }
}

// --- Fusion ---------------------------------------------------------------------------
// Opération irréversible : double confirmation (choix explicite + validation).
const { data: autresComposantes } = await useAsyncData(
  'composantes-liste',
  () => api<{ id: string, nom: string }[]>('/api/composantes'),
  { getCachedData: () => undefined },
)
const showFusion = ref(false)
const sourceFusion = ref('')
const fusionBusy = ref(false)
const fusionMsg = ref('')
const candidates = computed(() => (autresComposantes.value ?? []).filter(c => c.id !== id.value))
const fusionner = async () => {
  const src = candidates.value.find(c => c.id === sourceFusion.value)
  if (!src || fusionBusy.value) return
  if (!globalThis.confirm(`Fusionner « ${src.nom} » dans « ${p.value?.composante.nom} » ?\n\nTous ses actifs, services, départements, lieux et référents seront transférés, puis « ${src.nom} » sera supprimée. Cette action est irréversible.`)) return
  fusionBusy.value = true
  fusionMsg.value = ''
  try {
    const r = await api<{ ok: boolean, source: string, deplaces: Record<string, number> }>(
      `/api/composantes/${id.value}/fusionner`, { method: 'POST', body: { sourceId: sourceFusion.value } })
    const total = Object.values(r.deplaces).reduce((a, b) => a + b, 0)
    fusionMsg.value = `« ${r.source} » fusionnée : ${total} rattachement(s) transféré(s).`
    sourceFusion.value = ''
    await Promise.all([refreshNuxtData(`composante-${id.value}`), refreshReferents()])
  }
  catch { fusionMsg.value = 'La fusion a échoué.' }
  finally { fusionBusy.value = false }
}

const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const blocsRemplis = computed(() => (p.value?.blocs ?? []).filter(b => b.data.total > 0))
const blocsVides = computed(() => (p.value?.blocs ?? []).filter(b => b.data.total === 0))

// Points d'attention du périmètre : n'affiche que ce qui est non nul (pas de tuile à zéro).
const pointsAttention = computed(() => {
  const s = p.value?.posture
  if (!s) return []
  return [
    { n: s.aClasser, label: 'machine(s) GLPI à classer', icon: 'lucide:help-circle' },
    { n: s.obsoletes, label: 'système(s) en fin de support', icon: 'lucide:alarm-clock' },
    { n: s.serveursHorsGlpi, label: 'serveur(s) hors inventaire GLPI', icon: 'lucide:server-off' },
  ].filter(x => x.n > 0)
})

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <NuxtLink
          to="/composantes"
          class="inline-flex items-center gap-1 text-xs text-secondary-500 hover:text-primary-600"
        >
          <Icon
            name="lucide:arrow-left"
            class="size-3.5"
          /> Composantes
        </NuxtLink>
        <UITitle class="mt-1 tracking-tight text-secondary-900">
          {{ p?.composante.nom }}
          <span
            v-if="p?.composante.sigle"
            class="ml-1 text-base font-normal text-secondary-400"
          >({{ p.composante.sigle }})</span>
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          <span v-if="p?.composante.entite">{{ p.composante.entite }} · </span>
          {{ p?.total ?? 0 }} actif(s) rattaché(s)
        </p>
      </div>
      <NuxtLink
        v-if="editable"
        :to="`/composantes/${id}/edit`"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
      >
        <Icon
          name="lucide:pencil"
          class="size-4"
        /> Modifier
      </NuxtLink>
    </header>

    <!-- Posture DU PÉRIMÈTRE : la même lecture que le tableau de bord, ici restreinte. -->
    <!-- La couverture EDR de la composante, avec le détail par service et département :
         c'est ce détail qui désigne un interlocuteur. -->
    <CouvertureEdr
      :id="id"
      niveau="composante"
    />

    <section
      v-if="pointsAttention.length"
      class="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <div
        v-for="a in pointsAttention"
        :key="a.label"
        :class="[TUILE, 'flex items-center gap-3 !border-amber-200/70']"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50">
          <Icon
            :name="a.icon"
            class="size-4 text-amber-600"
          />
        </span>
        <span class="min-w-0">
          <span class="block text-xl font-semibold leading-none tracking-tight text-amber-700">{{ a.n }}</span>
          <span class="mt-1 block text-[13px] leading-tight text-secondary-700">{{ a.label }}</span>
        </span>
      </div>
    </section>

    <!-- Compteurs par type : cliquables, ils mènent au détail plus bas. -->
    <section
      v-if="blocsRemplis.length"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      <a
        v-for="b in blocsRemplis"
        :key="b.cle"
        :href="`#${b.cle}`"
        :class="[TUILE, 'flex items-center gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md']"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-primary-50">
          <Icon
            :name="b.icon"
            class="size-4 text-primary-600"
          />
        </span>
        <span class="min-w-0">
          <span class="block text-xl font-semibold leading-none tracking-tight text-secondary-900">{{ b.data.total }}</span>
          <span class="mt-1 block truncate text-[11px] text-secondary-500">{{ b.label }}</span>
        </span>
      </a>
    </section>

    <section
      v-if="!blocsRemplis.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucun actif rattaché à cette composante. Le rattachement se fait sur chaque fiche (champ « Composante »), ou automatiquement depuis l'entité GLPI à la synchronisation.
    </section>

    <!-- Référents cyber : à qui parle-t-on pour ce périmètre ? -->
    <section :class="[TUILE, 'space-y-3']">
      <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          name="lucide:users"
          class="size-4 text-primary-500"
        /> Référents cyber
      </h2>

      <div
        v-for="r in ROLES"
        :key="r.value"
        class="space-y-1"
      >
        <span class="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">
          <Icon
            :name="r.icon"
            class="size-3"
          /> {{ r.label }}
        </span>
        <p
          v-if="!parRole(r.value).length"
          class="px-1 text-xs text-secondary-400"
        >
          Aucun désigné.
        </p>
        <div
          v-for="ref in parRole(r.value)"
          :key="ref.id"
          class="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary-50"
        >
          <Icon
            name="lucide:user-round"
            class="size-3.5 shrink-0 text-secondary-400"
          />
          <NuxtLink
            :to="`/personnes/${ref.personneId}`"
            class="text-sm text-secondary-800 hover:underline"
          >{{ ref.nom ?? ref.personneId }}</NuxtLink>
          <span
            v-if="ref.email"
            class="truncate font-mono text-[10px] text-secondary-400"
          >{{ ref.email }}</span>
          <button
            v-if="editable"
            class="ml-auto shrink-0 rounded-md p-1 text-secondary-300 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Retirer"
            :disabled="busyRef"
            @click="retirerReferent(ref)"
          >
            <Icon
              name="lucide:x"
              class="size-3.5"
            />
          </button>
        </div>
      </div>

      <div
        v-if="editable"
        class="flex flex-wrap items-center gap-2 border-t border-secondary-100 pt-3"
      >
        <select
          v-model="ajout.role"
          :class="CHAMP"
        >
          <option
            v-for="r in ROLES"
            :key="r.value"
            :value="r.value"
          >
            {{ r.label }}
          </option>
        </select>
        <select
          v-model="ajout.personneId"
          :class="[CHAMP, 'min-w-[12rem] flex-1']"
        >
          <option value="">
            Choisir une personne…
          </option>
          <option
            v-for="x in personnes ?? []"
            :key="x.id"
            :value="x.id"
          >
            {{ nomPersonne(x) }}
          </option>
        </select>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          :disabled="!ajout.personneId || busyRef"
          @click="ajouterReferent"
        >
          <Icon
            name="lucide:plus"
            class="size-4"
          /> Ajouter
        </button>
      </div>
    </section>

    <!-- Détail par type -->
    <section
      v-for="b in blocsRemplis"
      :id="b.cle"
      :key="b.cle"
      :class="[TUILE, 'space-y-2 scroll-mt-4']"
    >
      <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          :name="b.icon"
          class="size-4 text-primary-500"
        />{{ b.label }}
        <span class="ml-auto font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">{{ b.data.total }}</span>
      </h2>
      <div class="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="i in b.data.items"
          :key="i.id"
          :to="`${b.base}/${i.id}`"
          class="truncate rounded-lg px-2 py-1.5 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 hover:text-primary-700"
        >
          {{ i.nom }}
        </NuxtLink>
      </div>
      <p
        v-if="b.data.total > b.data.items.length"
        class="px-2 text-xs text-secondary-400"
      >
        {{ b.data.items.length }} affiché(s) sur {{ b.data.total }} —
        <NuxtLink
          :to="b.base"
          class="text-primary-600 hover:underline"
        >voir tout le catalogue</NuxtLink>
      </p>
    </section>

    <p
      v-if="blocsVides.length"
      class="px-1 text-xs text-secondary-400"
    >
      Aucun élément pour : {{ blocsVides.map(b => b.label.toLowerCase()).join(', ') }}.
    </p>

    <!-- Fusion : réconcilier un doublon (ex. GLPI a créé « IUT NFC » à côté d'un existant). -->
    <section
      v-if="editable"
      :class="[TUILE, 'space-y-3']"
    >
      <button
        class="flex w-full items-center gap-2 text-left"
        @click="showFusion = !showFusion"
      >
        <Icon
          name="lucide:merge"
          class="size-4 text-secondary-400"
        />
        <span class="text-sm font-medium text-secondary-700">Fusionner une autre composante dans celle-ci</span>
        <Icon
          name="lucide:chevron-right"
          class="ml-auto size-4 text-secondary-400 transition-transform"
          :class="showFusion ? 'rotate-90' : ''"
        />
      </button>

      <template v-if="showFusion">
        <p class="text-xs text-secondary-500">
          La composante choisie sera <strong>supprimée</strong> et tout ce qui lui est rattaché (actifs, services, départements, lieux, référents) rejoindra « {{ p?.composante.nom }} ». Action irréversible.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="sourceFusion"
            :class="[CHAMP, 'min-w-[14rem] flex-1']"
          >
            <option value="">
              Composante à absorber…
            </option>
            <option
              v-for="c in candidates"
              :key="c.id"
              :value="c.id"
            >
              {{ c.nom }}
            </option>
          </select>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            :disabled="!sourceFusion || fusionBusy"
            @click="fusionner"
          >
            <Icon
              name="lucide:merge"
              class="size-4"
            /> {{ fusionBusy ? 'Fusion…' : 'Fusionner' }}
          </button>
        </div>
        <p
          v-if="fusionMsg"
          class="text-sm text-emerald-600"
        >
          {{ fusionMsg }}
        </p>
      </template>
    </section>
  </div>
</template>
