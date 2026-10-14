<script setup lang="ts">
import { computed } from 'vue'

// RÉGLAGES — l'administration de l'application. Les réglages d'administration existaient déjà,
// mais dispersés sur huit pages sans point d'entrée : on ne les trouvait qu'en connaissant leur
// adresse.

const api = useApi()
const perms = await usePermissions()
if (!perms.isAdmin.value) throw createError({ statusCode: 403, statusMessage: 'Réservé aux administrateurs' })

// Cadres de référence : cochés ici, ils décident de ce qui apparaît dans le menu.
const { cadres, rafraichir: rafraichirCadres } = useCadres()
await rafraichirCadres()
const bascule = ref('')
const basculerCadre = async (code: string, actif: boolean) => {
  bascule.value = code
  try {
    await api(`/api/cadres/${code}`, { method: 'PATCH', body: { actif } })
    await rafraichirCadres()
    // Rechargement complet : le menu est construit au montage de la barre latérale, une
    // simple mise à jour réactive ne le reconstruirait pas partout.
    window.location.reload()
  }
  finally { bascule.value = '' }
}

// États chargés en parallèle et TOLÉRANTS À L'ÉCHEC : un connecteur injoignable ne doit pas
// empêcher d'atteindre les autres réglages — c'est souvent précisément là qu'on vient quand
// quelque chose ne va pas.
function sansErreur<T>(p: Promise<T>) {
  return p.catch(() => null)
}

const { data: etats } = await useAsyncData('reglages-etats', async () => {
  const [glpi, slowpoke, harfanglab, certificats, referentiels, demandes] = await Promise.all([
    sansErreur(api<{ actif?: boolean, dernierAccesAt?: string }>('/api/glpi/config')),
    sansErreur(api<{ actif?: boolean, dernierAccesAt?: string, dernierStatut?: string, secretWebhookDefini?: boolean }>('/api/slowpoke/config')),
    sansErreur(api<{ actif?: boolean, dernierSyncAt?: string, dernierStatut?: string, jetonDefini?: boolean }>('/api/harfanglab/config')),
    sansErreur(api<{ total: number, jamaisScannes: number }>('/api/certificats/resume')),
    sansErreur(api<{ nom: string, attendus: number | null, enBase: number }[]>('/api/referentiels')),
    sansErreur(api<{ rows?: unknown[] } | unknown[]>('/api/change-requests?statut=en_attente')),
  ])
  return { glpi, slowpoke, harfanglab, certificats, referentiels, demandes }
}, { getCachedData: () => undefined })

const nbDemandes = computed(() => {
  const d = etats.value?.demandes as { rows?: unknown[] } | unknown[] | null
  if (!d) return 0
  return Array.isArray(d) ? d.length : (d.rows?.length ?? 0)
})
const ecartsReferentiels = computed(() =>
  (etats.value?.referentiels ?? []).filter(r => r.attendus !== null && r.enBase !== r.attendus).length)

const dateCourte = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  // Fuseau EXPLICITE : le conteneur serveur vit en UTC, le navigateur à Paris.
  return `${d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`
}

type Etat = { texte: string, cls: string } | null
const VERT = 'border-emerald-200 bg-emerald-50 text-emerald-700'
const AMBRE = 'border-amber-200 bg-amber-50 text-amber-700'
const GRIS = 'border-secondary-200 bg-secondary-50 text-secondary-600'

const BLOCS = computed(() => [
  {
    titre: 'Connecteurs',
    aide: 'Les sources qui alimentent l\'application. Toutes sont en lecture seule : aucune écriture n\'est effectuée dans les systèmes d\'origine.',
    entrees: [
      {
        url: '/glpi',
        icon: 'lucide:database-zap',
        libelle: 'Inventaire GLPI',
        detail: 'Machines, entités et lieux — synchronisation toutes les 15 minutes.',
        etat: (etats.value?.glpi
          ? etats.value.glpi.actif
            ? { texte: dateCourte(etats.value.glpi.dernierAccesAt) ? `Dernier accès ${dateCourte(etats.value.glpi.dernierAccesAt)}` : 'Actif', cls: VERT }
            : { texte: 'Inactif', cls: GRIS }
          : { texte: 'Non configuré', cls: AMBRE }) as Etat,
      },
      {
        url: '/incidents',
        icon: 'lucide:siren',
        libelle: 'Incidents (Sniff)',
        detail: 'Incidents, listes blanches de l\'EDR et compteurs réglementaires. Un secret de webhook permet la mise à jour immédiate d\'un appariement.',
        etat: (etats.value?.slowpoke
          ? etats.value.slowpoke.actif
            ? etats.value.slowpoke.secretWebhookDefini
              ? { texte: dateCourte(etats.value.slowpoke.dernierAccesAt) ? `Dernier accès ${dateCourte(etats.value.slowpoke.dernierAccesAt)}` : 'Actif', cls: VERT }
              // Le connecteur fonctionne sans secret ; seule la bascule immédiate est
              // indisponible. L'état le dit plutôt que d'afficher « Actif » sans nuance.
              : { texte: 'Actif — sans secret de webhook', cls: AMBRE }
            : { texte: 'Inactif', cls: GRIS }
          : { texte: 'Non configuré', cls: AMBRE }) as Etat,
      },
      {
        url: '/harfanglab',
        icon: 'lucide:radar',
        libelle: 'EDR HarfangLab',
        detail: 'Flotte d\'agents, état des moteurs de détection, jeux de règles et contenu des règles. Les listes blanches sont lues via Sniff.',
        etat: (etats.value?.harfanglab
          ? etats.value.harfanglab.actif
            ? etats.value.harfanglab.dernierStatut === 'erreur'
              ? { texte: 'Dernier relevé en échec', cls: 'border-red-200 bg-red-50 text-red-700' }
              : { texte: dateCourte(etats.value.harfanglab.dernierSyncAt) ? `Dernier relevé ${dateCourte(etats.value.harfanglab.dernierSyncAt)}` : 'Actif', cls: VERT }
            : { texte: 'Inactif', cls: GRIS }
          : { texte: 'Non configuré', cls: AMBRE }) as Etat,
      },
    ],
  },
  {
    titre: 'Données de référence',
    aide: 'Ce qui vient de sources officielles. Un import ne réécrit jamais le travail de la cellule.',
    entrees: [
      {
        url: '/referentiels',
        icon: 'lucide:library',
        libelle: 'Référentiels',
        detail: 'NIS 2 / ReCyF et sa correspondance ISO, ISO 27001, ISO 27002, RGPD, sections CNU, populations.',
        etat: (ecartsReferentiels.value
          ? { texte: `${ecartsReferentiels.value} écart(s)`, cls: 'border-red-200 bg-red-50 text-red-700' }
          : { texte: 'À jour', cls: VERT }) as Etat,
      },
      {
        url: '/fin-de-vie',
        icon: 'lucide:calendar-clock',
        libelle: 'Fin de vie des systèmes',
        detail: 'Dates de support du parc, complétées depuis endoflife.date.',
        etat: null as Etat,
      },
      {
        url: '/entite-nis2',
        icon: 'lucide:landmark',
        libelle: 'Entité NIS 2',
        detail: 'Entité importante ou essentielle — détermine les exigences applicables.',
        etat: null as Etat,
      },
      {
        url: '/certificats',
        icon: 'lucide:shield-check',
        libelle: 'Certificats TLS',
        detail: 'Sites surveillés et relevé de leur certificat. Les dates d\'expiration sont relevées, non saisies.',
        // Un certificat inscrit mais jamais relevé n'a pas de date connue : il n'apparaît
        // dans aucune alerte d'échéance. L'état le signale ici, où l'on vient corriger.
        etat: (etats.value?.certificats
          ? etats.value.certificats.jamaisScannes
            ? { texte: `${etats.value.certificats.jamaisScannes} jamais relevé(s)`, cls: AMBRE }
            : { texte: `${etats.value.certificats.total} surveillé(s)`, cls: VERT }
          : null) as Etat,
      },
    ],
  },
  {
    titre: 'Accès et contrôle',
    aide: 'Qui peut faire quoi, et ce qui a été fait. Les droits s\'attribuent catalogue par catalogue.',
    entrees: [
      {
        url: '/roles',
        icon: 'lucide:users',
        libelle: 'Utilisateurs & rôles',
        detail: 'Rôle par catégorie : lecteur, contributeur, gestionnaire.',
        etat: null as Etat,
      },
      {
        url: '/demandes',
        icon: 'lucide:inbox',
        libelle: 'Demandes de validation',
        detail: 'Écritures proposées par les contributeurs, à approuver ou refuser.',
        etat: (nbDemandes.value
          ? { texte: `${nbDemandes.value} en attente`, cls: AMBRE }
          : { texte: 'Aucune en attente', cls: GRIS }) as Etat,
      },
      {
        url: '/comptes-techniques',
        icon: 'lucide:key-round',
        libelle: 'Comptes techniques',
        detail: 'Clés d\'accès machine à l\'API, avec leur portée.',
        etat: null as Etat,
      },
      {
        url: '/documentation-api',
        icon: 'lucide:plug',
        libelle: 'API',
        detail: 'Référence des routes, authentification par clé, conventions.',
        etat: null as Etat,
      },
      {
        url: '/audit',
        icon: 'lucide:scroll-text',
        libelle: 'Journal d\'audit',
        detail: 'Qui a modifié quoi, avec le détail des valeurs avant et après.',
        etat: null as Etat,
      },
    ],
  },
])

const CARTE = 'rounded-2xl border border-secondary-200/70 bg-white p-5 shadow-sm'
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Réglages
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        L'administration de l'application. Vos préférences personnelles — notifications, menu, affichage —
        se règlent sur <NuxtLink
          to="/profil"
          class="font-medium text-primary-700 underline underline-offset-2"
        >votre profil</NuxtLink>.
      </p>
    </header>

    <!-- Cadres de référence : ce que l'établissement suit réellement. -->
    <section class="space-y-3">
      <div>
        <h2 class="font-semibold tracking-tight text-secondary-900">
          Cadres de référence
        </h2>
        <p class="mt-0.5 text-sm text-secondary-500">
          Les référentiels que vous suivez. Décocher un cadre <strong>masque ses pages</strong> —
          les données restent en base et réapparaissent intactes si vous le réactivez.
        </p>
      </div>
      <div :class="[CARTE, 'divide-y divide-secondary-100 !p-0']">
        <label
          v-for="c in cadres ?? []"
          :key="c.code"
          class="flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-secondary-50/50"
        >
          <input
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 accent-primary-600"
            :checked="c.actif"
            :disabled="bascule === c.code"
            @change="basculerCadre(c.code, ($event.target as HTMLInputElement).checked)"
          >
          <span class="min-w-0 flex-1">
            <span class="font-medium tracking-tight text-secondary-900">{{ c.nom }}</span>
            <span
              v-if="!c.actif"
              class="ml-2 inline-flex items-center rounded-md border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[10px] font-semibold text-secondary-500"
            >masqué</span>
            <span class="mt-0.5 block text-sm text-secondary-600">{{ c.description }}</span>
          </span>
        </label>
      </div>
      <p class="text-xs text-secondary-500">
        Le masquage est un confort d'affichage, <strong>pas un contrôle d'accès</strong> :
        une page masquée reste atteignable par son adresse pour qui en a le droit.
      </p>
    </section>

    <section
      v-for="bloc in BLOCS"
      :key="bloc.titre"
      class="space-y-3"
    >
      <div>
        <h2 class="font-semibold tracking-tight text-secondary-900">
          {{ bloc.titre }}
        </h2>
        <p class="mt-0.5 text-sm text-secondary-500">
          {{ bloc.aide }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NuxtLink
          v-for="e in bloc.entrees"
          :key="e.url"
          :to="e.url"
          :class="[CARTE, 'group flex items-start gap-3 transition-all duration-300 hover:border-primary-300 hover:shadow-md']"
        >
          <Icon
            :name="e.icon"
            class="mt-0.5 size-5 shrink-0 text-secondary-400 transition-colors group-hover:text-primary-600"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium tracking-tight text-secondary-900">{{ e.libelle }}</span>
              <span
                v-if="e.etat"
                class="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                :class="e.etat.cls"
              >{{ e.etat.texte }}</span>
            </div>
            <p class="mt-1 text-sm text-secondary-600">{{ e.detail }}</p>
          </div>
          <Icon
            name="lucide:chevron-right"
            class="mt-1 size-4 shrink-0 text-secondary-300 transition-colors group-hover:text-primary-500"
          />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
