<script setup lang="ts">
// INCIDENTS SNIFF RATTACHÉS À UN ACTIF — LECTURE SEULE. Le rapprochement se fait par
// l'identifiant GLPI, commun aux deux applications qui synchronisent le même inventaire.
import Pill from '~/components/ui/Pill.vue'
import DetailSection from '~/components/detail/DetailSection.vue'
import { libelleGravite, tonGravite } from '~/utils/graviteIncident'

const props = defineProps<{ actifId: string }>()

type Incident = {
  id: string
  type: string
  severity: string
  status: string
  description: string | null
  knowledgeAt?: string | null
  createdAt: string
}
type Reponse
  = | { etat: 'hors_inventaire' }
    | { etat: 'non_configure' }
    | { etat: 'erreur', message: string }
    | { etat: 'ok', glpiId: string, nomGlpi: string, entrees: number, incidents: Incident[] }

const api = useApi()
const { data } = await useAsyncData(
  `incidents-actif-${props.actifId}`,
  () => api<Reponse>(`/api/slowpoke/actifs/${props.actifId}/incidents`),
  { getCachedData: () => undefined },
)

// Adresse publique de Sniff : sert à renvoyer vers la fiche d'origine. Absente ou
// connecteur inactif, on n'affiche simplement pas de lien — jamais un lien mort.
const { data: config } = await useAsyncData(
  'sp-url-publique',
  () => api<{ url: string | null }>('/api/slowpoke/config').catch(() => ({ url: null })),
  { getCachedData: () => undefined },
)
const lienSniff = (id: string) => {
  const base = (config.value?.url ?? '').trim().replace(/\/+$/, '')
  return base ? `${base}/incidents/${id}` : null
}

const incidents = computed(() => (data.value?.etat === 'ok' ? data.value.incidents : []))
const ouverts = computed(() => incidents.value.filter(i => !['resolved', 'closed'].includes(i.status)).length)

const STATUTS: Record<string, string> = {
  open: 'Ouvert', investigating: 'En analyse', in_progress: 'En traitement',
  surveillance: 'Sous surveillance', resolved: 'Résolu', closed: 'Clos',
}
const dateFr = (iso: string | null | undefined) => {
  if (!iso) return null
  // Fuseau explicite : le conteneur serveur vit en UTC, le navigateur à Paris.
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
}
</script>

<template>
  <DetailSection
    title="Incidents de sécurité"
    icon="lucide:siren"
  >
    <!-- Hors inventaire : l'absence de résultat n'est PAS une absence d'incident. -->
    <div
      v-if="data?.etat === 'hors_inventaire'"
      class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800"
    >
      <Icon
        name="lucide:unlink"
        class="mt-0.5 size-4 shrink-0"
      />
      <p>
        <strong>Hors inventaire GLPI</strong> — sans identifiant, aucun rapprochement possible avec Sniff.
        Statut des incidents <strong>inconnu</strong>.
      </p>
    </div>

    <div
      v-else-if="data?.etat === 'non_configure'"
      class="flex items-start gap-3 rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3 text-sm text-secondary-600"
    >
      <Icon
        name="lucide:plug-zap"
        class="mt-0.5 size-4 shrink-0 text-secondary-400"
      />
      <p>Le connecteur Sniff n'est pas actif : les incidents de cet actif ne sont pas consultables ici.</p>
    </div>

    <div
      v-else-if="data?.etat === 'erreur'"
      class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm text-red-700"
    >
      <Icon
        name="lucide:triangle-alert"
        class="mt-0.5 size-4 shrink-0"
      />
      <p>Sniff n'a pas répondu correctement : {{ data.message }}</p>
    </div>

    <template v-else-if="data?.etat === 'ok'">
      <!-- Là seulement, une liste vide veut dire « aucun incident ». -->
      <div
        v-if="!incidents.length"
        class="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-800"
      >
        <Icon
          name="lucide:shield-check"
          class="mt-0.5 size-4 shrink-0"
        />
        <p>
          Aucun incident rattaché à cette machine dans Sniff.
          <span class="text-emerald-700/80">
            Machine reconnue dans l'inventaire ({{ data.nomGlpi }}<template v-if="data.entrees > 1">, {{ data.entrees }} entrées GLPI</template>).
          </span>
        </p>
      </div>

      <div
        v-else
        class="space-y-2"
      >
        <p class="text-xs text-secondary-500">
          {{ incidents.length }} incident(s) rattaché(s) à <span class="font-medium text-secondary-700">{{ data.nomGlpi }}</span>
          <span v-if="ouverts"> — dont <strong class="text-red-700">{{ ouverts }} non clos</strong></span>.
        </p>

        <component
          :is="lienSniff(i.id) ? 'a' : 'div'"
          v-for="i in incidents"
          :key="i.id"
          :href="lienSniff(i.id) ?? undefined"
          :target="lienSniff(i.id) ? '_blank' : undefined"
          rel="noopener"
          class="block rounded-xl border border-secondary-200/70 p-3 transition-colors"
          :class="lienSniff(i.id) ? 'hover:border-primary-300 hover:bg-secondary-50/50' : ''"
        >
          <div class="flex flex-wrap items-center gap-2">
            <Pill :tone="tonGravite(i.severity)">
              {{ libelleGravite(i.severity) }}
            </Pill>
            <Pill :tone="['resolved', 'closed'].includes(i.status) ? 'gray' : 'amber'">
              {{ STATUTS[i.status] ?? i.status }}
            </Pill>
            <span class="font-mono text-[11px] text-secondary-500">{{ i.type }}</span>
            <span class="ml-auto font-mono text-[11px] text-secondary-400">
              {{ dateFr(i.knowledgeAt ?? i.createdAt) }}
            </span>
          </div>
          <p
            v-if="i.description"
            class="mt-1.5 line-clamp-2 text-sm text-secondary-700"
          >
            {{ i.description }}
          </p>
        </component>
      </div>
    </template>
  </DetailSection>
</template>
