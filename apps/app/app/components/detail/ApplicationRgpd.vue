<script setup lang="ts">
// VOLET RGPD SUR LA FICHE — LECTURE SEULE. L'édition se fait dans le formulaire de
// l'application, où le volet s'ouvre dès que « Traite des données personnelles » est coché.
const props = defineProps<{ applicationId: string }>()

type Exigence = {
  id: string
  reference: string
  article: number
  intituleArticle: string
  intitule: string
  etat: 'conforme' | 'non_conforme' | 'non_applicable' | null
  justification: string | null
}
type Bloc = {
  aipdStatut: 'non_requise' | 'a_faire' | 'en_cours' | 'terminee'
  aipdMotif: string | null
  aipdMotifPrecision: string | null
  aipdConclusion: string | null
  aipdConclusionDetail: string | null
  aipdDate: string | null
  aipdRevueDate: string | null
  notes: string | null
}

const api = useApi()
const { data } = await useAsyncData(
  `app-rgpd-${props.applicationId}`,
  () => api<{ bloc: Bloc | null, exigences: Exigence[] }>(`/api/applications/${props.applicationId}/rgpd`),
  { getCachedData: () => undefined },
)

const exigences = computed(() => data.value?.exigences ?? [])
const bloc = computed(() => data.value?.bloc ?? null)
const evaluees = computed(() => exigences.value.filter(e => e.etat).length)
const ecarts = computed(() => exigences.value.filter(e => e.etat === 'non_conforme').length)

const LIBELLE_ETAT: Record<string, { label: string, cls: string }> = {
  conforme: { label: 'Conforme', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  non_conforme: { label: 'Non conforme', cls: 'border-red-200 bg-red-50 text-red-700' },
  non_applicable: { label: 'Non applicable', cls: 'border-secondary-200 bg-secondary-50 text-secondary-600' },
}
const LIBELLE_STATUT: Record<string, string> = {
  non_requise: 'Non requise', a_faire: 'À faire', en_cours: 'En cours', terminee: 'Terminée',
}
const LIBELLE_MOTIF: Record<string, string> = {
  evaluation_scoring: 'Évaluation ou notation', decision_automatisee: 'Décision automatisée',
  surveillance_systematique: 'Surveillance systématique', donnees_sensibles: 'Données sensibles',
  grande_echelle: 'Traitement à grande échelle', croisement_donnees: 'Croisement de jeux de données',
  personnes_vulnerables: 'Personnes vulnérables', usage_innovant: 'Usage innovant',
  liste_cnil: 'Liste CNIL', autre: 'Autre',
}
const LIBELLE_CONCLUSION: Record<string, string> = {
  risque_acceptable: 'Risque résiduel acceptable',
  acceptable_sous_reserve: 'Acceptable sous réserve des mesures prévues',
  risque_eleve_consultation: 'Risque résiduel élevé → consultation CNIL (art. 36)',
  traitement_modifie: 'Traitement abandonné ou modifié',
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <span
        v-if="ecarts"
        class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
      >
        <Icon
          name="lucide:triangle-alert"
          class="size-3.5"
        /> {{ ecarts }} écart(s)
      </span>
      <span
        v-else-if="evaluees === exigences.length && exigences.length"
        class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
      >
        <Icon
          name="lucide:check"
          class="size-3.5"
        /> Toutes les exigences évaluées, aucun écart
      </span>
      <span class="font-mono text-[11px] uppercase tracking-wide text-secondary-400">
        {{ evaluees }}/{{ exigences.length }} exigences évaluées
      </span>
    </div>

    <ul class="divide-y divide-secondary-100">
      <li
        v-for="e in exigences"
        :key="e.id"
        class="flex flex-wrap items-start gap-3 py-2"
      >
        <span class="font-mono text-xs font-semibold text-primary-700">Art. {{ e.reference }}</span>
        <span class="min-w-0 flex-1 text-sm text-secondary-700">
          {{ e.intitule }}
          <span
            v-if="e.justification"
            class="mt-0.5 block text-xs italic text-secondary-500"
          >{{ e.justification }}</span>
        </span>
        <span
          v-if="e.etat"
          class="shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
          :class="LIBELLE_ETAT[e.etat]?.cls"
        >{{ LIBELLE_ETAT[e.etat]?.label }}</span>
        <span
          v-else
          class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-secondary-300"
        >non évaluée</span>
      </li>
    </ul>

    <!-- Analyse d'impact -->
    <div
      v-if="bloc && bloc.aipdStatut !== 'non_requise'"
      class="rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3"
    >
      <p class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Analyse d'impact</span>
        <span class="rounded-md border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">
          {{ LIBELLE_STATUT[bloc.aipdStatut] }}
        </span>
        <span
          v-if="bloc.aipdMotif"
          class="text-xs text-secondary-600"
        >
          {{ LIBELLE_MOTIF[bloc.aipdMotif] ?? bloc.aipdMotif }}<template v-if="bloc.aipdMotifPrecision"> — {{ bloc.aipdMotifPrecision }}</template>
        </span>
        <span
          v-if="bloc.aipdDate"
          class="font-mono text-[10px] uppercase tracking-wide text-secondary-400"
        >du {{ bloc.aipdDate }}</span>
        <span
          v-if="bloc.aipdRevueDate"
          class="font-mono text-[10px] uppercase tracking-wide text-secondary-400"
        >· réexamen {{ bloc.aipdRevueDate }}</span>
      </p>
      <p
        v-if="bloc.aipdConclusion"
        class="mt-2 text-sm text-secondary-700"
      >
        {{ LIBELLE_CONCLUSION[bloc.aipdConclusion] ?? bloc.aipdConclusion }}
      </p>
      <!-- Article 36 : le seul cas où la conclusion crée une obligation immédiate. -->
      <p
        v-if="bloc.aipdConclusion === 'risque_eleve_consultation'"
        class="mt-2 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"
      >
        <Icon
          name="lucide:octagon-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        <span>
          <strong>Consultation préalable obligatoire.</strong> L'article 36 impose de consulter la CNIL
          <strong>avant</strong> la mise en œuvre du traitement.
        </span>
      </p>
      <p
        v-if="bloc.aipdConclusionDetail"
        class="mt-2 whitespace-pre-line text-sm text-secondary-600"
      >
        {{ bloc.aipdConclusionDetail }}
      </p>
      <p
        v-if="bloc.notes"
        class="mt-2 whitespace-pre-line text-xs text-secondary-500"
      >
        {{ bloc.notes }}
      </p>
    </div>

    <p class="text-xs text-secondary-500">
      <Icon
        name="lucide:info"
        class="mr-1 inline size-3.5 align-[-2px] text-secondary-400"
      />
      Ce volet se renseigne dans le formulaire de modification, sous « Sécurité &amp; données ».
    </p>
  </div>
</template>
