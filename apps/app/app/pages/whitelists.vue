<script setup lang="ts">
// LISTES BLANCHES — l'inventaire des angles morts volontaires. Chaque ligne est une décision de
// ne plus voir quelque chose.
import { UIButton, useToast } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'

type Whitelist = {
  id: string
  source: 'harfanglab' | 'sniff' | 'les_deux'
  sniffIncidentId: string | null
  certitudeRapprochement: 'certain' | 'probable' | null
  libelle: string
  cible: string | null
  regleSigma: string | null
  regleCorrelation: string | null
  motif: string | null
  active: boolean
  dateCreation: string
  dateRevision: string | null
  prolongations: number
  echeance: string | null
  sansEcheance: 'editeur' | 'technique' | 'disparue' | 'sans_date' | 'portee_par_sniff' | null
  technique: boolean
  fourniParEditeur: boolean
  presente: boolean
  criteres: string[] | Record<string, string> | null
  harfanglabId: string | null
  sniffExclusionId: string | null
  echeanceSniff: string | null
  tags: string[] | null
  champTags: string | null
  notes: string | null
  dateExpirationOutil: string | null
}
type Resume = {
  total: number
  actives: number
  echues: number
  techniques: number
  techniquesSansMotif: number
  editeur: number
  etablissement: number
  avecEcheance: number
  disparuesEncoreExclues: number
  sansDateCreation: number
  sousUnMois: number
  sansMotif: number
  avecIncident: number
  probables: number
  prolongeesPlusieursFois: number
}

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('whitelists')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
const modifiable = computed(() => perms.canWrite('whitelists'))

const filtre = ref<'' | 'echues' | 'sansMotif'>('')
// Voir les règles TECHNIQUES, les masquer, ou n'afficher qu'elles. Elles n'ont pas d'échéance —
// ce sont des pièces de la configuration de l'EDR, pas des dérogations — mais elles restent
// inventoriées : ne pas les dater n'est pas les cacher.
const origine = ref<'' | 'etablissement' | 'editeur'>('etablissement')
const requete = computed(() => {
  const p = new URLSearchParams()
  if (filtre.value) p.set(filtre.value, 'true')
  if (origine.value) p.set('origine', origine.value)
  const q = p.toString()
  return q ? `?${q}` : ''
})

const { data: liste, refresh } = await useAsyncData(
  'whitelists',
  () => api<{ total: number, tri: string, resultats: Whitelist[] }>(`/api/whitelists${requete.value}`),
  { getCachedData: () => undefined, watch: [requete] },
)
const { data: resume, refresh: refreshResume } = await useAsyncData(
  'whitelists-resume',
  () => api<Resume>('/api/whitelists/resume'),
  { getCachedData: () => undefined },
)

const ouvert = ref<string | null>(null)
const basculer = (id: string) => {
  ouvert.value = ouvert.value === id ? null : id
}

// Les critères arrivent de l'EDR sous la forme `champ|opérateur|valeur`. On les décompose
// pour les rendre lisibles, sans rien interpréter : la valeur reste telle quelle.
type Critere = { champ: string, operateur: string, valeur: string }
const criteres = (w: Whitelist): Critere[] => {
  const brut = w.criteres
  const lignes = Array.isArray(brut)
    ? brut.map(String)
    : brut && typeof brut === 'object'
      ? Object.entries(brut).map(([k, v]) => `${k}|=|${String(v)}`)
      : []
  return lignes.map((l) => {
    const [champ = l, operateur = '', ...reste] = l.split('|')
    return { champ, operateur, valeur: reste.join('|') }
  })
}

// Qui modifie quoi, pour CETTE règle. Trois cas seulement.
const gestion = (w: Whitelist) => {
  if (w.sniffIncidentId) {
    return {
      ou: 'Sniff, sur l\'incident ' + w.sniffIncidentId,
      quoi: 'Motif, date de revue et révocation. Le contenu de la règle reste modifiable dans HarfangLab.',
    }
  }
  if (w.fourniParEditeur) {
    return {
      ou: 'HarfangLab, console de l\'éditeur',
      quoi: 'Règle livrée avec le produit. Elle n\'est pas soumise à revue et n\'est pas modifiée par l\'établissement.',
    }
  }
  return {
    ou: 'HarfangLab pour le contenu, Catalogue pour la revue',
    quoi: 'Critères, cible et activation se modifient dans l\'EDR. La date de revue est portée ici, faute d\'exclusion Sniff rattachée.',
  }
}

const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '—')
const echue = (w: Whitelist) => w.active && !!w.echeance && w.echeance < aujourdhui

const { newToast } = useToast()
const enCours = ref('')
const prolonger = async (w: Whitelist) => {
  const motif = prompt(`Prolonger « ${w.libelle.slice(0, 60)} » d'un an.\n\nMotif de la prolongation (recommandé) :`)
  if (motif === null) return
  enCours.value = w.id
  try {
    await api(`/api/whitelists/${w.id}/prolonger`, { method: 'PATCH', body: { motif } })
    await Promise.all([refresh(), refreshResume()])
    newToast({ type: 'success', title: 'Prolongée d\'un an', icon: 'lucide:calendar-check' })
  }
  catch { newToast({ type: 'error', title: 'Prolongation impossible', icon: 'lucide:alert-circle' }) }
  finally { enCours.value = '' }
}

const SOURCES: Record<string, { label: string, tone: string }> = {
  harfanglab: { label: 'EDR', tone: 'blue' },
  sniff: { label: 'Sniff', tone: 'purple' },
  les_deux: { label: 'EDR + Sniff', tone: 'emerald' },
}

// `alerte` teinte en rouge : réservé à ce qui appelle une décision, jamais décoratif.
const TUILES = computed(() => {
  const r = resume.value
  if (!r) return []
  return [
    { label: 'Listes blanches', n: r.total, sub: `${r.actives} active(s)`, icon: 'lucide:shield-off', alerte: false, filtre: '' as const },
    { label: 'Échues', n: r.echues, sub: 'revue dépassée', icon: 'lucide:calendar-x', alerte: r.echues > 0, filtre: 'echues' as const },
    { label: 'Sans motif', n: r.sansMotif, sub: 'indéfendables en revue', icon: 'lucide:help-circle', alerte: r.sansMotif > 0, filtre: 'sansMotif' as const },
    { label: 'Liées à un incident', n: r.avecIncident, sub: 'justification connue', icon: 'lucide:link', alerte: false, filtre: '' as const },
    { label: 'Fournies par l\'éditeur', n: r.editeur, sub: 'sans échéance', icon: 'lucide:package', alerte: false, filtre: '' as const },
    { label: 'Disparues, encore exclues', n: r.disparuesEncoreExclues, sub: 'à lever dans Sniff', icon: 'lucide:ghost', alerte: r.disparuesEncoreExclues > 0, filtre: '' as const },
  ]
})

// Chaque motif dit ce qu'il est, et pourquoi il n'y a pas de date — jamais un blanc.
const MOTIF_SANS_ECHEANCE: Record<string, { libelle: string, aide: string }> = {
  editeur: {
    libelle: 'Fournie par l\'éditeur',
    aide: 'Règle fournie par l\'éditeur avec le produit. Elle ne relève pas d\'une décision de la cellule et n\'est pas soumise à revue.',
  },
  technique: {
    libelle: 'Technique · sans échéance',
    aide: 'Règle de configuration de l\'EDR, distincte d\'une dérogation. Non soumise à revue périodique.',
  },
  disparue: {
    libelle: 'Disparue de l\'EDR',
    aide: 'Règle absente de l\'EDR au dernier relevé : elle ne s\'applique plus et n\'appelle pas de revue. Si une exclusion active la référence encore, sa levée relève de Sniff, sur l\'incident.',
  },
  sans_date: {
    libelle: 'Sans date de création',
    aide: 'L\'EDR n\'a pas fourni de date de création. L\'échéance ne peut pas être calculée ; la date d\'import n\'est pas utilisée comme substitut.',
  },
  portee_par_sniff: {
    libelle: 'Portée par Sniff',
    aide: 'La date de revue est portée par Sniff : sur l\'incident quand une exclusion couvre la règle, sur la revue isolée quand la règle a été posée hors incident.',
  },
}

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Listes blanches
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Inventaire unifié des règles de la détection non appliquée : règles définies dans l'EDR et
        exclusions décidées dans Sniff.
      </p>
    </header>

    <!-- RÉPARTITION DES RESPONSABILITÉS. Trois lignes, énoncées une fois en tête de page ;
         chaque fiche rappelle ensuite le cas qui la concerne. -->
    <section class="rounded-xl border border-secondary-200/70 bg-secondary-50/40 px-4 py-3">
      <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
        Où se modifie une liste blanche
      </p>
      <dl class="mt-2 grid gap-x-8 gap-y-1.5 text-xs sm:grid-cols-3">
        <div>
          <dt class="font-medium text-secondary-800">
            HarfangLab
          </dt>
          <dd class="text-secondary-600">
            Critères, cible, activation. Le contenu de la règle se modifie dans l'EDR. Le Catalogue en tient l'inventaire en lecture.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-secondary-800">
            Sniff
          </dt>
          <dd class="text-secondary-600">
            Motif, date de revue et révocation des exclusions rattachées à un incident, ainsi que
            l'appariement entre une exclusion et une règle de l'EDR.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-secondary-800">
            Catalogue
          </dt>
          <dd class="text-secondary-600">
            Date de revue des règles de l'établissement sans exclusion rattachée, et alertes
            d'échéance. Aucune écriture vers l'EDR ni vers Sniff.
          </dd>
        </div>
      </dl>
      <p class="mt-2 text-[11px] text-secondary-500">
        La validité court sur un an à compter de la création dans l'outil d'origine, et non depuis la
        date d'import. Une prolongation redémarre le compteur et est décomptée.
      </p>
    </section>

    <section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <button
        v-for="t in TUILES"
        :key="t.label"
        :class="[TUILE, 'flex items-center gap-3 text-left transition-colors hover:border-primary-300']"
        @click="filtre = filtre === t.filtre ? '' : t.filtre"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-xl border"
          :class="t.alerte ? 'border-red-100 bg-red-50' : 'border-primary-100 bg-primary-50'"
        >
          <Icon
            :name="t.icon"
            class="size-4"
            :class="t.alerte ? 'text-red-600' : 'text-primary-600'"
          />
        </span>
        <span>
          <span
            class="block text-xl font-semibold leading-none tracking-tight"
            :class="t.alerte ? 'text-red-700' : 'text-secondary-900'"
          >{{ t.n }}</span>
          <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
          <span class="block text-[10px] text-secondary-400">{{ t.sub }}</span>
        </span>
      </button>
    </section>

    <!-- L'ORIGINE, filtre par défaut sur « établissement ». -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">Origine</span>
      <div class="inline-flex overflow-hidden rounded-lg border border-secondary-200/80">
        <button
          v-for="o in [
            { v: 'etablissement' as const, l: 'Écrites par l\'établissement' },
            { v: 'editeur' as const, l: 'Fournies par l\'éditeur' },
            { v: '' as const, l: 'Toutes' },
          ]"
          :key="o.v"
          class="px-3 py-1.5 text-xs transition-colors"
          :class="origine === o.v
            ? 'bg-primary-600 font-medium text-white'
            : 'bg-white text-secondary-600 hover:bg-secondary-50'"
          @click="origine = o.v"
        >
          {{ o.l }}
        </button>
      </div>
      <span class="text-[11px] text-secondary-400">
        Seules les règles écrites par l'établissement portent une échéance de revue. Les règles fournies
        par l'éditeur en sont exemptes.
      </span>
    </div>

    <p
      v-if="filtre"
      class="flex items-center gap-2 text-xs text-secondary-500"
    >
      Filtre actif : <strong>{{ filtre === 'echues' ? 'échues' : 'sans motif' }}</strong>
      <button
        class="rounded border border-secondary-200 px-1.5 py-0.5 hover:bg-secondary-50"
        @click="filtre = ''"
      >
        tout afficher
      </button>
    </p>

    <section
      v-if="!liste?.resultats?.length"
      class="rounded-2xl border border-dashed border-secondary-300 py-16 text-center"
    >
      <p class="text-sm font-medium text-secondary-700">
        {{ filtre ? 'Aucune liste blanche ne correspond à ce filtre.' : 'Aucune liste blanche inventoriée.' }}
      </p>
      <p
        v-if="!filtre"
        class="mx-auto mt-1 max-w-lg text-xs text-secondary-500"
      >
        L'inventaire se remplit à la synchronisation du connecteur HarfangLab, qui reprend au passage
        les exclusions déclarées dans Sniff.
      </p>
    </section>

    <section
      v-else
      class="grid grid-cols-1 gap-3"
    >
      <div
        v-for="w in liste?.resultats ?? []"
        :key="w.id"
        :class="[TUILE, echue(w) ? '!border-red-200' : '']"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <Pill :tone="SOURCES[w.source]?.tone ?? 'gray'">
                {{ SOURCES[w.source]?.label ?? w.source }}
              </Pill>
              <Pill
                v-if="w.certitudeRapprochement === 'probable'"
                tone="amber"
                title="Rapprochement établi sur la portée, pas sur une référence d'outil : à vérifier."
              >
                Rapprochement probable
              </Pill>
              <Pill
                v-if="!w.active"
                tone="gray"
              >
                Inactive
              </Pill>
              <Pill
                v-if="!w.motif"
                tone="red"
                title="Une liste blanche sans motif est indéfendable en revue."
              >
                Sans motif
              </Pill>
              <Pill
                v-if="w.prolongations >= 2"
                tone="orange"
                :title="`Prolongée ${w.prolongations} fois : ce n'est plus une mesure temporaire.`"
              >
                {{ w.prolongations }} prolongations
              </Pill>
            </div>
            <button
              class="mt-1.5 flex w-full items-start gap-1.5 text-left"
              :aria-expanded="ouvert === w.id"
              @click="basculer(w.id)"
            >
              <Icon
                :name="ouvert === w.id ? 'lucide:chevron-down' : 'lucide:chevron-right'"
                class="mt-0.5 size-4 shrink-0 text-secondary-400"
              />
              <span class="break-all font-mono text-sm text-secondary-800">{{ w.libelle }}</span>
            </button>
            <p
              v-if="w.motif"
              class="mt-1 text-sm text-secondary-600"
            >
              {{ w.motif }}
            </p>
            <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-secondary-400">
              <span>Créée le {{ dateFr(w.dateCreation) }}</span>
              <span v-if="w.dateRevision">· Revue le {{ dateFr(w.dateRevision) }}</span>
              <span v-if="w.regleSigma">· Règle {{ w.regleSigma }}</span>
              <span v-if="w.cible">· Cible {{ w.cible }}</span>
              <span v-if="w.sniffIncidentId">· Incident {{ w.sniffIncidentId }}</span>
            </p>

            <!-- FICHE. Le contenu de la règle, et où il se modifie. -->
            <div
              v-if="ouvert === w.id"
              class="mt-3 space-y-3 border-t border-secondary-200/60 pt-3"
            >
              <div v-if="criteres(w).length">
                <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
                  Critères appliqués
                </p>
                <div class="mt-1.5 overflow-x-auto">
                  <table class="w-full text-[11px]">
                    <tbody>
                      <tr
                        v-for="(c, i) in criteres(w)"
                        :key="i"
                        class="border-b border-secondary-100 last:border-0"
                      >
                        <td class="py-1 pr-3 font-mono text-secondary-600">
                          {{ c.champ }}
                        </td>
                        <td class="py-1 pr-3 font-mono text-secondary-400">
                          {{ c.operateur }}
                        </td>
                        <td class="break-all py-1 font-mono text-secondary-800">
                          {{ c.valeur }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p
                v-else
                class="text-[11px] text-secondary-400"
              >
                Aucun critère structuré n'est fourni par l'EDR pour cette règle.
              </p>

              <dl class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-4">
                <div v-if="w.cible">
                  <dt class="text-secondary-400">
                    Cible
                  </dt>
                  <dd class="text-secondary-800">
                    {{ w.cible }}
                  </dd>
                </div>
                <div v-if="w.regleSigma || w.regleCorrelation">
                  <dt class="text-secondary-400">
                    Règle visée
                  </dt>
                  <dd class="text-secondary-800">
                    {{ w.regleSigma ?? w.regleCorrelation }}
                  </dd>
                </div>
                <div v-if="w.dateExpirationOutil">
                  <dt class="text-secondary-400">
                    Expiration déclarée dans l'EDR
                  </dt>
                  <dd class="text-secondary-800">
                    {{ dateFr(w.dateExpirationOutil) }}
                  </dd>
                </div>
                <div v-if="w.harfanglabId">
                  <dt class="text-secondary-400">
                    Identifiant EDR
                  </dt>
                  <dd class="break-all font-mono text-[10px] text-secondary-500">
                    {{ w.harfanglabId }}
                  </dd>
                </div>
              </dl>

              <!-- QUI MODIFIE QUOI. Trois cas, énoncés pour cette règle précise. -->
              <div class="rounded-lg border border-secondary-200/70 bg-secondary-50/50 px-3 py-2">
                <p class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">
                  Modification
                </p>
                <p class="mt-1 text-[11px] text-secondary-700">
                  <strong>{{ gestion(w).ou }}</strong> — {{ gestion(w).quoi }}
                </p>
              </div>

              <p
                v-if="w.notes"
                class="whitespace-pre-line text-[11px] text-secondary-500"
              >
                {{ w.notes }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-2">
            <!-- L'absence d'échéance est rendue AVEC SON MOTIF. Une date vide toute seule
                 se lit comme un oubli ; avec son motif, elle se lit comme une décision. -->
            <span
              v-if="w.sansEcheance && w.sansEcheance !== 'portee_par_sniff'"
              class="rounded-lg border border-secondary-200 bg-secondary-50 px-2 py-1 text-xs font-semibold text-secondary-600"
              :title="MOTIF_SANS_ECHEANCE[w.sansEcheance]?.aide"
            >
              {{ MOTIF_SANS_ECHEANCE[w.sansEcheance]?.libelle ?? w.sansEcheance }}
            </span>
            <span
              v-else-if="w.sansEcheance === 'portee_par_sniff'"
              class="rounded-lg border px-2 py-1 text-xs font-semibold"
              :class="echue(w) ? 'border-red-200 bg-red-50 text-red-700' : 'border-secondary-200 bg-secondary-50 text-secondary-600'"
              title="Cette règle est appariée à un incident : c'est Sniff qui porte la date de revue."
            >
              {{ echue(w) ? 'Échue le' : 'Revue au' }} {{ dateFr(w.echeance) }} · Sniff
            </span>
            <span
              v-else
              class="rounded-lg border px-2 py-1 text-xs font-semibold"
              :class="echue(w) ? 'border-red-200 bg-red-50 text-red-700' : 'border-secondary-200 bg-secondary-50 text-secondary-600'"
            >
              {{ echue(w) ? 'Échue le' : 'Revue au' }} {{ dateFr(w.echeance) }}
            </span>
            <!-- QUI PROLONGE QUOI. La date de revue naît là où naît la décision : une exclusion rattachée à un incident se prolonge dans Sniff, où le motif est tenu. -->
            <UIButton
              v-if="modifiable && w.active && w.sansEcheance === null"
              variant="outline"
              size="sm"
              :disabled="enCours === w.id"
              @click="prolonger(w)"
            >
              <Icon
                name="lucide:calendar-plus"
                class="size-4"
              /> Prolonger d'un an
            </UIButton>
            <!-- Rattachée à un incident : la prolongation se décide dans Sniff. Le dire,
                 plutôt que de laisser un espace vide qui ressemble à un droit manquant. -->
            <span
              v-else-if="w.active && w.sansEcheance === 'portee_par_sniff'"
              class="max-w-40 text-right text-[11px] leading-snug text-secondary-400"
            >
              Se prolonge dans Sniff, sur l'incident
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
