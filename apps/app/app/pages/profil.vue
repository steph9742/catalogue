<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { UIButton, useToast } from '@catalogue/ui'
import EventSelector from '~/components/EventSelector.vue'

// PROFIL — la page personnelle : qui je suis, à quoi j'ai droit, et mes réglages.

const api = useApi()
const { newToast } = useToast()

// --- Identité et accès -----------------------------------------------------------------
type Moi = { id: string, email: string, name: string | null, admin: boolean, roles: Record<string, string> }
const { data: moi } = await useAsyncData('profil-moi', () => api<Moi>('/api/me'), { getCachedData: () => undefined })
const { data: categories } = await useAsyncData('profil-categories',
  () => api<{ key: string, label: string }[]>('/api/categories'), { getCachedData: () => undefined })

const ROLES: Record<string, { label: string, aide: string, cls: string }> = {
  gestionnaire: { label: 'Gestionnaire', aide: 'lecture et modification directe', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  contributeur: { label: 'Contributeur', aide: 'lecture ; vos modifications partent en validation', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  lecteur: { label: 'Lecteur', aide: 'consultation seule', cls: 'border-secondary-200 bg-secondary-50 text-secondary-600' },
}

// Ce à quoi l'utilisateur a effectivement accès, libellé compris — et non une liste de
// clés techniques qui ne parlerait qu'aux développeurs.
const mesAcces = computed(() => {
  const r = moi.value?.roles ?? {}
  return (categories.value ?? [])
    .filter(c => r[c.key])
    .map(c => ({ ...c, role: r[c.key]! }))
    .sort((a, b) => a.label.localeCompare(b.label))
})
const nbSansAcces = computed(() => (categories.value?.length ?? 0) - mesAcces.value.length)

const initiales = computed(() => {
  const n = (moi.value?.name || moi.value?.email || '?').trim()
  const mots = n.split(/[\s.@_-]+/).filter(Boolean)
  // Un nom en un seul mot (« Admin ») donne ses deux premières lettres, pas une seule.
  return (mots.length > 1 ? mots.slice(0, 2).map(m => m[0]!).join('') : n.slice(0, 2)).toUpperCase()
})

// --- Notifications ---------------------------------------------------------------------
const push = usePush()

// CE QU'ON PEUT RÉELLEMENT RECEVOIR. Le serveur n'accepte un abonnement que sur les catégories
// GÉRÉES : les autres événements sont écartés à l'enregistrement, sans message.
const categoriesGerees = computed<string[] | null>(() =>
  moi.value?.admin
    ? null
    : Object.entries(moi.value?.roles ?? {}).filter(([, r]) => r === 'gestionnaire').map(([c]) => c),
)
const peutSAbonner = computed(() => categoriesGerees.value === null || categoriesGerees.value.length > 0)

const events = ref<string[]>([])
const abonne = ref(false)
const occupe = ref(false)

onMounted(async () => {
  if (!push.supported) return
  const s = await push.status()
  abonne.value = s.subscribed
  events.value = s.events
})

const agir = async (fn: () => Promise<void>, ok: string) => {
  occupe.value = true
  try {
    await fn()
    newToast({ type: 'success', title: ok, icon: 'lucide:check-circle-2' })
  }
  catch (e: unknown) {
    newToast({ type: 'error', title: (e as Error)?.message ?? 'Échec.', icon: 'lucide:alert-circle' })
  }
  finally { occupe.value = false }
}

const activer = () => agir(async () => {
  await push.subscribe(events.value)
  abonne.value = true
}, 'Notifications activées sur ce navigateur.')

// Vérification de bout en bout. Le message distingue les trois causes possibles d'une
// notification qui n'arrive pas : rien d'envoyé, envoi refusé, ou envoi accepté mais non
// affiché par le système — cette dernière étant invisible sans ce test.
const tester = async () => {
  occupe.value = true
  try {
    const r = await api<{ ok: boolean, message: string }>('/api/push/test', { method: 'POST' })
    newToast({
      type: r.ok ? 'success' : 'error',
      title: r.ok ? 'Notification de test envoyée' : 'L\'envoi n\'a pas abouti',
      message: r.message,
      icon: r.ok ? 'lucide:send' : 'lucide:alert-circle',
    })
  }
  catch { newToast({ type: 'error', title: 'Test impossible', icon: 'lucide:alert-circle' }) }
  finally { occupe.value = false }
}
const enregistrerEvenements = () => agir(async () => {
  await push.saveEvents(events.value)
}, 'Préférences enregistrées.')
const desactiver = () => agir(async () => {
  await push.unsubscribe()
  abonne.value = false
}, 'Notifications désactivées.')

// --- Ordre des sections du menu ---------------------------------------------------------
// Les libellés doivent rester alignés sur ceux de la barre latérale (USidebar).
const SECTIONS_MENU = [
  { id: 'logique', titre: 'Cartographie logique' },
  { id: 'materielle', titre: 'Cartographie matérielle' },
  { id: 'reseau', titre: 'Cartographie réseau' },
  { id: 'humaine', titre: 'Cartographie humaine' },
  { id: 'smsi', titre: 'SMSI / ISO 27001' },
  { id: 'nis2', titre: 'Conformité NIS 2' },
  { id: 'gouvernance', titre: 'Gouvernance SMSI' },
  { id: 'supervision', titre: 'Supervision' },
  { id: 'autres', titre: 'Autres' },
]
const navPrefs = useNavPrefs()
await navPrefs.charger()
const sections = ref([...navPrefs.ordonner(SECTIONS_MENU)])

const deplacer = (i: number, delta: number) => {
  const j = i + delta
  if (j < 0 || j >= sections.value.length) return
  const copie = [...sections.value]
  const [item] = copie.splice(i, 1)
  copie.splice(j, 0, item!)
  sections.value = copie
}
const enregistrerOrdre = () => agir(async () => {
  await navPrefs.definirOrdre(sections.value.map(s => s.id))
}, 'Ordre du menu enregistré.')
const reinitialiserOrdre = () => agir(async () => {
  sections.value = [...SECTIONS_MENU]
  await navPrefs.definirOrdre([])
}, 'Ordre par défaut rétabli.')

// --- Affichage des listes ----------------------------------------------------------------
// Le mode (cartes/tableau) et les colonnes sont mémorisés par catalogue.
const vues = useState<Record<string, { mode?: string, colonnes?: string[] }>>('vues-catalogues', () => ({}))
const nbVues = computed(() => Object.keys(vues.value ?? {}).length)
const reinitialiserVues = () => agir(async () => {
  vues.value = {}
  await api('/api/preferences', { method: 'PUT', body: { vuesCatalogues: {} } })
}, 'Affichage des listes réinitialisé.')

const CARTE = 'rounded-2xl border border-secondary-200/70 bg-white p-6 shadow-sm'
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <!-- Identité -->
    <section :class="[CARTE, 'flex flex-wrap items-center gap-4']">
      <div class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">
        {{ initiales }}
      </div>
      <div class="min-w-0 flex-1">
        <UITitle class="tracking-tight text-secondary-900">
          {{ moi?.name || 'Mon profil' }}
        </UITitle>
        <p class="truncate text-sm text-secondary-600">
          {{ moi?.email }}
        </p>
      </div>
      <span
        v-if="moi?.admin"
        class="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800"
      >
        <Icon
          name="lucide:shield-check"
          class="size-4"
        /> Administrateur
      </span>
    </section>

    <!-- Mes accès : la réponse à « pourquoi cette page m'est-elle refusée ? » -->
    <section :class="[CARTE, 'space-y-4']">
      <div>
        <h2 class="font-semibold tracking-tight text-secondary-900">
          Mes accès
        </h2>
        <p class="mt-1 text-sm text-secondary-600">
          Les droits sont attribués <strong>catalogue par catalogue</strong>. Une page refusée signifie qu'un rôle manque sur ce domaine, non que la connexion a échoué.
        </p>
      </div>

      <div
        v-if="moi?.admin"
        class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900"
      >
        En tant qu'administrateur, vous avez accès à <strong>tous les catalogues</strong>, quels que soient les rôles ci-dessous.
      </div>

      <div
        v-if="!mesAcces.length && !moi?.admin"
        class="rounded-xl border border-dashed border-secondary-300 p-6 text-center"
      >
        <Icon
          name="lucide:lock"
          class="mx-auto mb-2 size-6 text-secondary-400"
        />
        <p class="text-sm font-medium text-secondary-700">
          Aucun accès pour l'instant
        </p>
        <p class="mx-auto mt-1 max-w-md text-xs text-secondary-500">
          Vous êtes bien connecté, mais aucun rôle ne vous a encore été attribué.
          Demandez à un administrateur les domaines dont vous avez besoin.
        </p>
      </div>

      <ul
        v-else-if="mesAcces.length"
        class="divide-y divide-secondary-100"
      >
        <li
          v-for="a in mesAcces"
          :key="a.key"
          class="flex flex-wrap items-center gap-3 py-2.5"
        >
          <span class="min-w-0 flex-1 truncate text-sm text-secondary-800">{{ a.label }}</span>
          <span
            class="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
            :class="ROLES[a.role]?.cls"
          >
            {{ ROLES[a.role]?.label ?? a.role }}
          </span>
          <span class="hidden text-xs text-secondary-500 sm:inline">{{ ROLES[a.role]?.aide }}</span>
        </li>
      </ul>

      <p
        v-if="nbSansAcces > 0 && !moi?.admin"
        class="text-xs text-secondary-500"
      >
        {{ nbSansAcces }} autre(s) domaine(s) ne vous sont pas ouverts.
      </p>
    </section>

    <!-- Notifications -->
    <section :class="[CARTE, 'space-y-4']">
      <div>
        <h2 class="font-semibold tracking-tight text-secondary-900">
          Notifications
        </h2>
        <p class="mt-1 text-sm text-secondary-600">
          Alertes envoyées par le navigateur, même quand l'application est fermée.
          L'abonnement vaut <strong>pour ce navigateur</strong> : activez-le sur chaque appareil où vous voulez être prévenu.
        </p>
      </div>

      <div
        v-if="!push.supported"
        class="rounded-xl border border-secondary-200 bg-secondary-50/60 p-3 text-sm text-secondary-600"
      >
        Ce navigateur ne gère pas les notifications. Essayez depuis un navigateur récent, en HTTPS.
      </div>

      <!-- Sans catégorie gérée, le serveur refuse l'abonnement. On le DIT ici plutôt que
           de laisser essayer, échouer, et chercher pourquoi. -->
      <div
        v-else-if="!peutSAbonner"
        class="rounded-xl border border-secondary-200 bg-secondary-50/60 p-3 text-sm text-secondary-600"
      >
        Les notifications sont réservées aux <strong>gestionnaires</strong> : elles s'adressent aux gestionnaires d'une catégorie. Vous n'en gérez aucune. Un administrateur peut vous en attribuer une depuis
        <em>Réglages → Utilisateurs &amp; rôles</em>.
      </div>

      <template v-else>
        <p
          v-if="categoriesGerees"
          class="text-xs text-secondary-500"
        >
          Seules les catégories dont vous êtes gestionnaire apparaissent ci-dessous :
          <strong>{{ categoriesGerees.length }}</strong> sur {{ categories?.length ?? 0 }}.
        </p>
        <EventSelector
          v-model="events"
          :allowed="categoriesGerees"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UIButton
            v-if="!abonne"
            variant="primary"
            :disabled="occupe"
            @click="activer"
          >
            <Icon
              name="lucide:bell"
              class="size-4"
            /> Activer sur ce navigateur
          </UIButton>
          <template v-else>
            <UIButton
              variant="primary"
              :disabled="occupe"
              @click="enregistrerEvenements"
            >
              <Icon
                name="lucide:save"
                class="size-4"
              /> Enregistrer
            </UIButton>
            <UIButton
              variant="outline"
              :disabled="occupe"
              @click="tester"
            >
              <Icon
                name="lucide:send"
                class="size-4"
              /> Envoyer un test
            </UIButton>
            <UIButton
              variant="outline"
              :disabled="occupe"
              @click="desactiver"
            >
              <Icon
                name="lucide:bell-off"
                class="size-4"
              /> Désactiver
            </UIButton>
          </template>
        </div>

        <p
          v-if="abonne"
          class="text-xs text-secondary-500"
        >
          Test annoncé envoyé mais rien à l'écran : la notification est bloquée par le système. Vérifiez que le navigateur est autorisé à afficher des notifications
          (réglages du système), et qu'aucun mode « Ne pas déranger » n'est actif.
        </p>
      </template>
    </section>

    <!-- Ordre du menu -->
    <section :class="[CARTE, 'space-y-4']">
      <div>
        <h2 class="font-semibold tracking-tight text-secondary-900">
          Ordre du menu
        </h2>
        <p class="mt-1 text-sm text-secondary-600">
          Placez en haut les sections que vous utilisez le plus. Ce réglage vous suit d'un poste à l'autre.
        </p>
      </div>

      <ul class="divide-y divide-secondary-100 rounded-xl border border-secondary-200/70">
        <li
          v-for="(s, i) in sections"
          :key="s.id"
          class="flex items-center gap-2 px-3 py-2"
        >
          <span class="w-5 shrink-0 font-mono text-xs text-secondary-400">{{ i + 1 }}</span>
          <span class="min-w-0 flex-1 truncate text-sm text-secondary-800">{{ s.titre }}</span>
          <button
            class="text-secondary-400 transition-colors hover:text-primary-600 disabled:opacity-25"
            :disabled="i === 0"
            aria-label="Monter"
            @click="deplacer(i, -1)"
          >
            <Icon
              name="lucide:chevron-up"
              class="size-4"
            />
          </button>
          <button
            class="text-secondary-400 transition-colors hover:text-primary-600 disabled:opacity-25"
            :disabled="i === sections.length - 1"
            aria-label="Descendre"
            @click="deplacer(i, 1)"
          >
            <Icon
              name="lucide:chevron-down"
              class="size-4"
            />
          </button>
        </li>
      </ul>

      <div class="flex flex-wrap gap-2">
        <UIButton
          variant="primary"
          :disabled="occupe"
          @click="enregistrerOrdre"
        >
          <Icon
            name="lucide:save"
            class="size-4"
          /> Enregistrer l'ordre
        </UIButton>
        <UIButton
          variant="outline"
          :disabled="occupe"
          @click="reinitialiserOrdre"
        >
          Rétablir l'ordre par défaut
        </UIButton>
      </div>
    </section>

    <!-- Affichage des listes -->
    <section :class="[CARTE, 'space-y-4']">
      <div>
        <h2 class="font-semibold tracking-tight text-secondary-900">
          Affichage des listes
        </h2>
        <p class="mt-1 text-sm text-secondary-600">
          Le mode (cartes ou tableau) et les colonnes choisies sont mémorisés <strong>pour chaque catalogue</strong>,
          au fil de la navigation. La remise à zéro rétablit l'affichage par défaut.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UIButton
          variant="outline"
          :disabled="occupe || !nbVues"
          @click="reinitialiserVues"
        >
          <Icon
            name="lucide:rotate-ccw"
            class="size-4"
          /> Réinitialiser l'affichage
        </UIButton>
        <span class="text-xs text-secondary-500">
          {{ nbVues ? `${nbVues} catalogue(s) avec un affichage personnalisé` : 'Aucun affichage personnalisé' }}
        </span>
      </div>
    </section>
  </div>
</template>
