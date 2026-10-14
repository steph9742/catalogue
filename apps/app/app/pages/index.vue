<script setup lang="ts">
// Tableau de bord de PILOTAGE. Il répond à « qu'est-ce qui cloche aujourd'hui ?

const api = useApi()
const perms = await usePermissions()

type Pilotage = {
  urgences: {
    notifsEnRetard: number | null
    notifProchaine: { id: string, libelle: string, echeance: string, jalon: string } | null
    actionsEnRetard: number | null
    demandes: number | null
    alertesCritiques: number
    alertesTotal: number
    aClasser: number
  }
  posture: {
    conformiteNis2: { taux: number, fait: number, base: number } | null
    risquesCritiques: number | null
    mesuresEnAttente: number | null
    partiesDanger: number | null
    // `{ nombre, sur }` : le dénominateur accompagne le nombre. « 580 machines hors support »
    // sans population ne se rapporte à rien, et l'écran Fin de vie en affiche un autre sur une
    // AUTRE population — le lecteur conclut à une incohérence là où il y a deux questions.
    horsSupport: { nombre: number, sur: number } | null
    sansDateEol: number | null
  }
  parc: {
    serveurs: number | null
    postes: number | null
    mobiles: number | null
    iot: number | null
    parComposante: { id: string, nom: string, serveurs: number, postes: number }[]
    technosEol: number | null
    issusGlpi: number
  }
}

// Chargement TOLÉRANT : si l'API échoue — installation neuve dont la base n'est pas encore
// migrée, connecteur en panne, droits incomplets — la page doit se rendre quand même.
const { data: brut, error: erreurPilotage } = await useAsyncData(
  'pilotage',
  () => api<Pilotage>('/api/dashboard/pilotage'),
  { getCachedData: () => undefined },
)

// On ne retient la réponse que si elle a bien la forme attendue.
const p = computed<Pilotage | null>(() => {
  const d = brut.value as Pilotage | null | undefined
  return d && typeof d === 'object' && 'urgences' in d && 'posture' in d && 'parc' in d ? d : null
})
const enPanne = computed(() => !!erreurPilotage.value || (!!brut.value && !p.value))
const isAdmin = perms.isAdmin

// --- (a) Ce qui brûle ----------------------------------------------------------------
// Une entrée n'apparaît QUE si elle est non nulle : un tableau vide = tout va bien, et
// c'est en soi l'information la plus utile.
const urgences = computed(() => {
  const u = p.value?.urgences
  if (!u) return []
  return [
    { k: 'notifs', n: u.notifsEnRetard, label: 'jalon(s) NIS 2 dépassé(s)', sub: 'Déclaration à l\'ANSSI', href: '/notifications-nis2', icon: 'lucide:siren' },
    { k: 'actions', n: u.actionsEnRetard, label: 'action(s) NIS 2 en retard', sub: 'Plan d\'actions', href: '/plan-actions-nis2', icon: 'lucide:list-todo' },
    { k: 'alertes', n: u.alertesCritiques, label: 'échéance(s) critique(s)', sub: 'VPN, technologies, contrats', href: '/alertes', icon: 'lucide:alarm-clock', adminOnly: true },
    { k: 'demandes', n: u.demandes, label: 'demande(s) à valider', sub: 'Contributions en attente', href: '/demandes', icon: 'lucide:inbox' },
    { k: 'classer', n: u.aClasser, label: 'machine(s) à classer', sub: 'Inventaire GLPI', href: '/glpi', icon: 'lucide:help-circle', adminOnly: true },
    { k: 'eol', n: p.value?.posture?.sansDateEol ?? 0, label: 'système(s) sans date de fin de vie', sub: 'Non évalués — à renseigner', href: '/fin-de-vie', icon: 'lucide:help-circle' },
  ].filter(x => (x.n ?? 0) > 0 && (!x.adminOnly || isAdmin.value))
})

// Prochaine échéance réglementaire : le compte à rebours le plus contraignant de l'app.
const prochaine = computed(() => p.value?.urgences?.notifProchaine ?? null)
const restant = (iso: string) => {
  const h = Math.floor((new Date(iso).getTime() - Date.now()) / 3600000)
  return h >= 48 ? `${Math.floor(h / 24)} j` : `${Math.max(0, h)} h`
}

// --- (b) Posture ---------------------------------------------------------------------
const posture = computed(() => {
  const s = p.value?.posture
  if (!s) return []
  return [
    { k: 'nis2', n: s.conformiteNis2 ? `${s.conformiteNis2.taux}%` : null, label: 'Conformité NIS 2', sub: s.conformiteNis2 ? `${s.conformiteNis2.fait}/${s.conformiteNis2.base} exigences` : '', href: '/exigences-nis2', icon: 'lucide:clipboard-check', tone: (s.conformiteNis2?.taux ?? 0) >= 80 ? 'ok' : (s.conformiteNis2?.taux ?? 0) >= 50 ? 'moyen' : 'faible' },
    { k: 'risques', n: s.risquesCritiques, label: 'Risques élevés ouverts', sub: 'Gravité grave ou critique', href: '/matrice-risques', icon: 'lucide:triangle-alert', tone: (s.risquesCritiques ?? 0) > 0 ? 'faible' : 'ok' },
    { k: 'mesures', n: s.mesuresEnAttente, label: 'Mesures SoA à traiter', sub: 'Applicables, non mises en œuvre', href: '/mesures-smsi', icon: 'lucide:list-checks', tone: 'neutre' },
    { k: 'horsSupport', n: s.horsSupport?.nombre ?? null, label: 'Machines hors support', sub: s.horsSupport ? `sur ${s.horsSupport.sur.toLocaleString('fr-FR')} serveurs et postes` : '', href: '/fin-de-vie', icon: 'lucide:shield-x', tone: (s.horsSupport?.nombre ?? 0) > 0 ? 'faible' : 'ok' },
    { k: 'ecosysteme', n: s.partiesDanger, label: 'Parties en zone de danger', sub: 'Écosystème EBIOS', href: '/ecosysteme', icon: 'lucide:share-2', tone: (s.partiesDanger ?? 0) > 0 ? 'faible' : 'ok' },
  ].filter(x => x.n !== null && x.n !== undefined)
})
const TONE: Record<string, string> = {
  ok: 'text-emerald-600', moyen: 'text-amber-600', faible: 'text-red-600', neutre: 'text-secondary-900',
}

// --- (c) Parc ------------------------------------------------------------------------
const parc = computed(() => {
  const c = p.value?.parc
  if (!c) return []
  return [
    { label: 'Serveurs', n: c.serveurs, href: '/serveurs', icon: 'lucide:server' },
    { label: 'Postes', n: c.postes, href: '/postes-travail', icon: 'lucide:monitor' },
    { label: 'Mobiles', n: c.mobiles, href: '/appareils-mobiles', icon: 'lucide:tablet-smartphone' },
    { label: 'IoT', n: c.iot, href: '/iot', icon: 'lucide:cctv' },
  ].filter(x => x.n !== null)
})
const composantes = computed(() => (p.value?.parc?.parComposante ?? []).filter(c => c.serveurs + c.postes > 0))
const maxComposante = computed(() => Math.max(1, ...composantes.value.map(c => c.serveurs + c.postes)))

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <!-- Les indicateurs sont indisponibles : on le DIT, et on donne la marche à suivre.
         Une page qui se contente d'afficher des zéros ferait croire que tout va bien. -->
    <section
      v-if="enPanne"
      class="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
    >
      <div class="flex gap-3">
        <Icon
          name="lucide:alert-triangle"
          class="mt-0.5 size-5 shrink-0 text-amber-600"
        />
        <div class="min-w-0 text-sm text-amber-900">
          <p class="font-medium">
            Les indicateurs ne sont pas disponibles.
          </p>
          <p class="mt-1 text-amber-800">
            Le reste de l'application reste utilisable. Sur une installation neuve, la cause la plus
            fréquente est une base non migrée ou non initialisée&nbsp;:
            <code class="rounded bg-amber-100 px-1">./deploy/migrer.sh</code> puis
            <code class="rounded bg-amber-100 px-1">docker compose run --rm seed</code>.
            Les journaux du serveur donnent le motif exact.
          </p>
        </div>
      </div>
    </section>

    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Tableau de bord
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Ce qui demande une action, la posture de sécurité, puis le parc.
      </p>
    </header>

    <!-- ================= (a) CE QUI BRÛLE ================= -->
    <section class="space-y-3">
      <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        <Icon
          name="lucide:flame"
          class="size-4 text-red-500"
        /> À traiter
      </h2>

      <!-- Prochaine échéance réglementaire : mise en avant, c'est le délai le plus court. -->
      <NuxtLink
        v-if="prochaine"
        to="/notifications-nis2"
        :class="[TUILE, 'flex flex-wrap items-center gap-3 !border-amber-200 !bg-amber-50/60 transition-colors hover:!bg-amber-50']"
      >
        <Icon
          name="lucide:timer"
          class="size-5 shrink-0 text-amber-600"
        />
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-amber-900">Prochaine déclaration : {{ prochaine.jalon }}</span>
          <span class="block truncate text-xs text-amber-700/80">{{ prochaine.libelle }}</span>
        </span>
        <span class="shrink-0 font-mono text-lg font-semibold text-amber-700">{{ restant(prochaine.echeance) }}</span>
      </NuxtLink>

      <div
        v-if="urgences.length"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <NuxtLink
          v-for="u in urgences"
          :key="u.k"
          :to="u.href"
          :class="[TUILE, 'flex items-center gap-3 !border-red-200/70 transition-all hover:-translate-y-0.5 hover:shadow-md']"
        >
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50">
            <Icon
              :name="u.icon"
              class="size-5 text-red-600"
            />
          </span>
          <span class="min-w-0">
            <span class="block text-xl font-semibold leading-none tracking-tight text-red-600">{{ u.n }}</span>
            <span class="mt-1 block text-sm text-secondary-800">{{ u.label }}</span>
            <span class="block truncate text-[11px] text-secondary-400">{{ u.sub }}</span>
          </span>
        </NuxtLink>
      </div>

      <div
        v-else-if="p"
        :class="[TUILE, '!border-emerald-200 !bg-emerald-50/50 flex items-center gap-3']"
      >
        <Icon
          name="lucide:check-circle-2"
          class="size-5 shrink-0 text-emerald-600"
        />
        <span class="text-sm text-emerald-800">Rien en retard ni en attente. Tout est à jour.</span>
      </div>
    </section>

    <!-- ================= (b) POSTURE ================= -->
    <section
      v-if="posture.length"
      class="space-y-3"
    >
      <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        <Icon
          name="lucide:shield"
          class="size-4 text-primary-500"
        /> Posture cyber
      </h2>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <NuxtLink
          v-for="s in posture"
          :key="s.k"
          :to="s.href"
          :class="[TUILE, 'transition-all hover:-translate-y-0.5 hover:shadow-md']"
        >
          <Icon
            :name="s.icon"
            class="size-4 text-primary-500"
          />
          <span
            class="mt-2 block text-2xl font-semibold leading-none tracking-tight"
            :class="TONE[s.tone]"
          >{{ s.n }}</span>
          <span class="mt-1.5 block text-[13px] leading-tight text-secondary-800">{{ s.label }}</span>
          <span class="block truncate text-[11px] text-secondary-400">{{ s.sub }}</span>
        </NuxtLink>
      </div>
    </section>

    <!-- ================= (c) PARC ================= -->
    <section
      v-if="parc.length || composantes.length"
      class="space-y-3"
    >
      <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
        <Icon
          name="lucide:boxes"
          class="size-4 text-primary-500"
        /> Parc
      </h2>

      <div
        v-if="parc.length"
        class="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <NuxtLink
          v-for="c in parc"
          :key="c.label"
          :to="c.href"
          :class="[TUILE, 'flex items-center gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md']"
        >
          <span class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-primary-50">
            <Icon
              :name="c.icon"
              class="size-4 text-primary-600"
            />
          </span>
          <span class="min-w-0">
            <span class="block text-xl font-semibold leading-none tracking-tight text-secondary-900">{{ c.n }}</span>
            <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ c.label }}</span>
          </span>
        </NuxtLink>
      </div>

      <!-- Répartition par composante : le pivot le plus parlant du parc. -->
      <div
        v-if="composantes.length"
        :class="[TUILE, 'space-y-2']"
      >
        <div class="flex items-center justify-between">
          <span class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Par composante</span>
          <NuxtLink
            to="/composantes"
            class="text-xs text-primary-600 hover:underline"
          >Toutes les composantes</NuxtLink>
        </div>
        <NuxtLink
          v-for="c in composantes"
          :key="c.id"
          :to="`/composantes/${c.id}`"
          class="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary-50"
        >
          <span class="min-w-0 flex-1 truncate text-sm text-secondary-800">{{ c.nom }}</span>
          <span class="hidden shrink-0 font-mono text-[10px] uppercase tracking-wide text-secondary-400 sm:inline">{{ c.serveurs }} srv · {{ c.postes }} postes</span>
          <span class="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-secondary-100 sm:w-28">
            <span
              class="block h-full rounded-full bg-primary-400"
              :style="{ width: `${((c.serveurs + c.postes) / maxComposante) * 100}%` }"
            />
          </span>
          <span class="w-12 shrink-0 text-right font-mono text-xs font-semibold text-secondary-600">{{ c.serveurs + c.postes }}</span>
        </NuxtLink>
      </div>

      <p
        v-if="p?.parc.technosEol || p?.parc.issusGlpi"
        class="px-1 text-xs text-secondary-400"
      >
        <template v-if="p?.parc.technosEol">
          <NuxtLink
            to="/technologies"
            class="text-primary-600 hover:underline"
          >{{ p.parc.technosEol }} technologie(s) en fin de vie</NuxtLink> ·
        </template>
        {{ p?.parc.issusGlpi }} machine(s) issues de l'inventaire GLPI
      </p>
    </section>
  </div>
</template>
