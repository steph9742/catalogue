<script setup lang="ts">
// VOLET RGPD DU FORMULAIRE — exigences de sécurité du traitement et analyse d'impact.
export type BlocRgpd = {
  aipdStatut: 'non_requise' | 'a_faire' | 'en_cours' | 'terminee'
  aipdMotif: string | null
  aipdMotifPrecision: string | null
  aipdConclusion: string | null
  aipdConclusionDetail: string | null
  aipdDate: string | null
  aipdRevueDate: string | null
  notes: string | null
}
export type EtatExigence = { exigenceRgpdId: string, etat: 'conforme' | 'non_conforme' | 'non_applicable', justification: string | null }

type Exigence = {
  id: string
  reference: string
  article: number
  intituleArticle: string
  intitule: string
}

const props = defineProps<{
  bloc: BlocRgpd
  etats: EtatExigence[]
  // Absent en création : les exigences ne se rattachent qu'à une application existante.
  applicationId?: string
}>()

const emit = defineEmits<{
  'update:bloc': [BlocRgpd]
  'update:etats': [EtatExigence[]]
}>()

const api = useApi()
// `niveau=application` renvoie exactement ce que la fiche affiche : mêmes exigences, même
// exclusion de l'article 35 (porté par le bloc d'analyse d'impact).
const { data: exigences, error: erreurExigences } = await useAsyncData(
  'rgpd-exigences-application',
  () => api<Exigence[]>('/api/rgpd/exigences?niveau=application'),
  { getCachedData: () => undefined, default: () => [] as Exigence[] },
)

const aCocher = computed(() => exigences.value ?? [])

const etatDe = (id: string) => props.etats.find(e => e.exigenceRgpdId === id) ?? null

const poser = (e: Exigence, etat: EtatExigence['etat'] | null) => {
  const autres = props.etats.filter(x => x.exigenceRgpdId !== e.id)
  // Retirer la ligne plutôt que de poser un état neutre : l'absence de réponse est un état
  // à part entière, et « personne n'a regardé » ne se confond pas avec « c'est conforme ».
  if (!etat) return emit('update:etats', autres)
  const actuel = etatDe(e.id)
  emit('update:etats', [...autres, { exigenceRgpdId: e.id, etat, justification: actuel?.justification ?? null }])
}

const justifier = (e: Exigence, texte: string) => {
  const actuel = etatDe(e.id)
  if (!actuel) return
  emit('update:etats', [
    ...props.etats.filter(x => x.exigenceRgpdId !== e.id),
    { ...actuel, justification: texte || null },
  ])
}

const majBloc = (champ: keyof BlocRgpd, valeur: string | null) => {
  const suivant: BlocRgpd = { ...props.bloc, [champ]: valeur || null } as BlocRgpd
  // Une conclusion n'a de sens que sur une analyse TERMINÉE : la garder après un retour en
  // « en cours » afficherait un verdict qui n'a plus cours.
  if (champ === 'aipdStatut') {
    if (valeur !== 'terminee') {
      suivant.aipdConclusion = null
      suivant.aipdConclusionDetail = null
    }
    if (valeur === 'non_requise') {
      suivant.aipdMotif = null
      suivant.aipdMotifPrecision = null
    }
  }
  emit('update:bloc', suivant)
}

const evaluees = computed(() => props.etats.length)
const ecarts = computed(() => props.etats.filter(e => e.etat === 'non_conforme').length)

const ETATS = [
  { v: 'conforme', label: 'Conforme', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { v: 'non_conforme', label: 'Non conforme', cls: 'border-red-300 bg-red-50 text-red-700' },
  { v: 'non_applicable', label: 'Non applicable', cls: 'border-secondary-300 bg-secondary-50 text-secondary-600' },
] as const

const STATUTS = [
  { v: 'non_requise', label: 'Non requise' },
  { v: 'a_faire', label: 'À faire' },
  { v: 'en_cours', label: 'En cours' },
  { v: 'terminee', label: 'Terminée' },
]

const MOTIFS = [
  { v: 'evaluation_scoring', label: 'Évaluation ou notation (y compris profilage)' },
  { v: 'decision_automatisee', label: 'Décision automatisée avec effet juridique' },
  { v: 'surveillance_systematique', label: 'Surveillance systématique' },
  { v: 'donnees_sensibles', label: 'Données sensibles ou hautement personnelles' },
  { v: 'grande_echelle', label: 'Traitement à grande échelle' },
  { v: 'croisement_donnees', label: 'Croisement de jeux de données' },
  { v: 'personnes_vulnerables', label: 'Personnes vulnérables (étudiants, patients…)' },
  { v: 'usage_innovant', label: 'Usage innovant ou nouvelle technologie' },
  { v: 'liste_cnil', label: 'Figure sur la liste CNIL des traitements soumis à AIPD' },
  { v: 'autre', label: 'Autre (préciser)' },
]

const CONCLUSIONS = [
  { v: 'risque_acceptable', label: 'Risque résiduel acceptable' },
  { v: 'acceptable_sous_reserve', label: 'Acceptable sous réserve des mesures prévues' },
  { v: 'risque_eleve_consultation', label: 'Risque résiduel élevé → consultation CNIL (art. 36)' },
  { v: 'traitement_modifie', label: 'Traitement abandonné ou modifié' },
]

const labelCls = 'block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
const inputCls = 'w-full rounded-lg border border-secondary-200/80 bg-white px-3 py-2.5 text-sm text-secondary-900 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <div class="space-y-6">
    <!-- Exigences applicables au traitement -->
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span :class="labelCls">Exigences de sécurité applicables au traitement</span>
        <span
          v-if="ecarts"
          class="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
        >
          <Icon
            name="lucide:triangle-alert"
            class="size-3"
          /> {{ ecarts }} écart(s)
        </span>
        <span class="font-mono text-[10px] uppercase tracking-wide text-secondary-400">
          {{ evaluees }}/{{ aCocher.length }} évaluées
        </span>
      </div>

      <!-- TROIS CAS QUI S'EXCLUENT, dans une vraie chaîne v-if / v-else-if / v-else. -->
      <p
        v-if="!applicationId"
        class="text-xs text-secondary-500"
      >
        <Icon
          name="lucide:info"
          class="mr-1 inline size-3.5 align-[-2px] text-secondary-400"
        />
        Les exigences pourront être renseignées après la création de la fiche.
      </p>

      <!-- Un 403 n'est PAS un référentiel vide : inviter à importer alors que ce sont les
           droits qui manquent enverrait chercher un défaut au mauvais endroit. -->
      <p
        v-else-if="erreurExigences"
        class="rounded-lg border border-dashed border-secondary-300 bg-secondary-50/50 p-3 text-xs text-secondary-600"
      >
        <Icon
          name="lucide:lock"
          class="mr-1 inline size-3.5 align-[-2px] text-secondary-400"
        />
        Le référentiel RGPD n'a pas pu être lu — vos droits ne couvrent probablement pas la
        catégorie « Exigences RGPD ». Les états déjà enregistrés sont conservés ; demandez le
        rôle lecteur sur cette catégorie pour les voir et les modifier.
      </p>

      <!-- ÉTAT VIDE EXPLICITE : une liste vide sans un mot ressemble à une panne, alors que
           le référentiel n'a simplement jamais été importé. -->
      <p
        v-else-if="!aCocher.length"
        class="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-800"
      >
        <Icon
          name="lucide:triangle-alert"
          class="mr-1 inline size-3.5 align-[-2px]"
        />
        Aucune exigence RGPD en base. Importez le référentiel depuis
        <NuxtLink
          to="/referentiels"
          class="font-medium underline underline-offset-2"
        >Réglages → Référentiels</NuxtLink>
        pour pouvoir renseigner la conformité de ce traitement.
      </p>

      <template v-else>
        <div
          v-for="e in aCocher"
          :key="e.id"
          class="rounded-xl border border-secondary-200/70 bg-white p-3"
          :class="etatDe(e.id)?.etat === 'non_conforme' ? '!border-red-200 bg-red-50/30' : ''"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-baseline gap-2">
                <span class="font-mono text-xs font-semibold text-primary-700">Art. {{ e.reference }}</span>
                <span class="text-[11px] text-secondary-400">{{ e.intituleArticle }}</span>
              </p>
              <p class="mt-1 text-sm text-secondary-700">
                {{ e.intitule }}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-1">
              <button
                v-for="o in ETATS"
                :key="o.v"
                type="button"
                class="rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors"
                :class="etatDe(e.id)?.etat === o.v ? o.cls : 'border-secondary-200 text-secondary-500 hover:bg-secondary-50'"
                @click="poser(e, etatDe(e.id)?.etat === o.v ? null : o.v)"
              >
                {{ o.label }}
              </button>
            </div>
          </div>
          <!-- La justification est ATTENDUE sur « non applicable » : écarter une exigence
               sans motif est la façon la plus simple d'être conforme sur le papier. -->
          <input
            v-if="etatDe(e.id)?.etat === 'non_applicable' || etatDe(e.id)?.etat === 'non_conforme'"
            :value="etatDe(e.id)?.justification ?? ''"
            :placeholder="etatDe(e.id)?.etat === 'non_applicable' ? 'Pourquoi cette exigence ne s\'applique pas' : 'Ce qui manque, et ce qui est prévu'"
            :class="[inputCls, 'mt-2']"
            @input="justifier(e, ($event.target as HTMLInputElement).value)"
          >
        </div>
      </template>
    </div>

    <!-- Analyse d'impact -->
    <div class="space-y-4 rounded-xl border border-secondary-200/70 bg-white p-4">
      <div>
        <h4 class="font-semibold tracking-tight text-secondary-900">
          Analyse d'impact (art. 35)
        </h4>
        <p class="mt-0.5 text-xs text-secondary-500">
          Obligatoire avant le traitement lorsqu'il est susceptible d'engendrer un risque élevé
          pour les droits et libertés des personnes.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <label :class="labelCls">Statut</label>
          <select
            :value="bloc.aipdStatut"
            :class="inputCls"
            @change="majBloc('aipdStatut', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="s in STATUTS"
              :key="s.v"
              :value="s.v"
            >
              {{ s.label }}
            </option>
          </select>
        </div>

        <div
          v-if="bloc.aipdStatut !== 'non_requise'"
          class="space-y-2"
        >
          <label :class="labelCls">Motif</label>
          <select
            :value="bloc.aipdMotif ?? ''"
            :class="inputCls"
            @change="majBloc('aipdMotif', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              —
            </option>
            <option
              v-for="m in MOTIFS"
              :key="m.v"
              :value="m.v"
            >
              {{ m.label }}
            </option>
          </select>
        </div>

        <div
          v-if="bloc.aipdMotif === 'autre'"
          class="space-y-2 sm:col-span-2"
        >
          <label :class="labelCls">Précision du motif</label>
          <input
            :value="bloc.aipdMotifPrecision ?? ''"
            :class="inputCls"
            placeholder="Sans précision, le choix de faire une analyse n'est pas justifié"
            @input="majBloc('aipdMotifPrecision', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <!-- La conclusion n'apparaît que sur une analyse terminée : une analyse en cours
             n'a précisément rien conclu. -->
        <div
          v-if="bloc.aipdStatut === 'terminee'"
          class="space-y-2 sm:col-span-2"
        >
          <label :class="labelCls">Conclusion</label>
          <select
            :value="bloc.aipdConclusion ?? ''"
            :class="inputCls"
            @change="majBloc('aipdConclusion', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              —
            </option>
            <option
              v-for="c in CONCLUSIONS"
              :key="c.v"
              :value="c.v"
            >
              {{ c.label }}
            </option>
          </select>
        </div>

        <!-- Article 36 : le seul cas où la conclusion crée une obligation immédiate. -->
        <p
          v-if="bloc.aipdConclusion === 'risque_eleve_consultation'"
          class="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 sm:col-span-2"
        >
          <Icon
            name="lucide:octagon-alert"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>
            <strong>Consultation préalable obligatoire.</strong> L'article 36 impose de consulter la CNIL
            <strong>avant</strong> de mettre en œuvre le traitement lorsque le risque résiduel reste élevé.
          </span>
        </p>

        <div
          v-if="bloc.aipdStatut === 'terminee'"
          class="space-y-2 sm:col-span-2"
        >
          <label :class="labelCls">Détail de la conclusion</label>
          <textarea
            :value="bloc.aipdConclusionDetail ?? ''"
            rows="3"
            :class="inputCls"
            @input="majBloc('aipdConclusionDetail', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>

        <div
          v-if="bloc.aipdStatut !== 'non_requise'"
          class="space-y-2"
        >
          <label :class="labelCls">Date de l'analyse</label>
          <input
            :value="bloc.aipdDate ?? ''"
            type="date"
            :class="inputCls"
            @input="majBloc('aipdDate', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div
          v-if="bloc.aipdStatut !== 'non_requise'"
          class="space-y-2"
        >
          <label :class="labelCls">Réexamen prévu</label>
          <input
            :value="bloc.aipdRevueDate ?? ''"
            type="date"
            :class="inputCls"
            @input="majBloc('aipdRevueDate', ($event.target as HTMLInputElement).value)"
          >
          <p class="text-[11px] text-secondary-500">
            Art. 35.11 : une analyse se réexamine, elle ne se classe pas. La date échue remonte dans les alertes.
          </p>
        </div>

        <div class="space-y-2 sm:col-span-2">
          <label :class="labelCls">Notes</label>
          <textarea
            :value="bloc.notes ?? ''"
            rows="2"
            :class="inputCls"
            @input="majBloc('notes', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
