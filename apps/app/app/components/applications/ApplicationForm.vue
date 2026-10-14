<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { UIButton } from '@catalogue/ui'
import FormSection from '~/components/form/FormSection.vue'
import FormRgpd, { type BlocRgpd, type EtatExigence } from '~/components/applications/FormRgpd.vue'
import {
  appCategories, appCriticites, appStatuts, appHebergements,
  appExpositions, appSensibilites, appMaintenances, authMethodes,
  deploiementRoles, environnements, responsabiliteRoles,
  type EnumOption,
} from '~/utils/catalogueEnums'

type Refs = {
  tiers: EnumOption[]
  poles: EnumOption[]
  personnes: EnumOption[]
  serveurs: EnumOption[]
  technologies: EnumOption[]
  populations: EnumOption[]
  groupes: EnumOption[]
  composantes: EnumOption[]
  services: EnumOption[]
  departements: EnumOption[]
}

const orgaTypes: EnumOption[] = [
  { value: 'pole', label: 'Pôle' },
  { value: 'composante', label: 'Composante' },
  { value: 'service', label: 'Service' },
  { value: 'departement', label: 'Département' },
]

const props = defineProps<{
  initial?: Record<string, unknown>
  refs?: Refs
  submitLabel?: string
  saving?: boolean
  readOnly?: boolean
}>()

// Présent en édition, absent en création : une exigence ne se rattache qu'à une fiche
// existante, et le volet le dit plutôt que de proposer des cases sans effet.
const applicationId = computed(() => (props.initial?.id as string | undefined) || undefined)

const emit = defineEmits<{
  submit: [payload: Record<string, unknown>]
  cancel: []
}>()

// Normalise les valeurs initiales (les champs optionnels arrivent en null depuis l'API).
const init = props.initial ?? {}
const str = (v: unknown, fallback = '') => (v == null ? fallback : String(v))
const form = reactive({
  nom: str(init.nom),
  description: str(init.description),
  categorie: str(init.categorie, 'metier'),
  categoriePrecision: str(init.categoriePrecision),
  criticite: str(init.criticite),
  statut: str(init.statut, 'en_production'),
  hebergement: str(init.hebergement),
  exposition: str(init.exposition),
  sensibilite: str(init.sensibilite),
  donneesPersonnelles: Boolean(init.donneesPersonnelles ?? false),
  // Volet RGPD : tenu ici et envoyé avec le reste — un seul bouton « Enregistrer ».
  rgpd: {
    aipdStatut: 'non_requise',
    aipdMotif: null,
    aipdMotifPrecision: null,
    aipdConclusion: null,
    aipdConclusionDetail: null,
    aipdDate: null,
    aipdRevueDate: null,
    notes: null,
    ...((init.rgpd as Record<string, unknown> | null) ?? {}),
  } as BlocRgpd,
  rgpdExigences: ((init.rgpdExigences as EtatExigence[] | undefined) ?? []).map(e => ({ ...e })),
  authentification: (Array.isArray(init.authentification) ? init.authentification : []) as string[],
  authentificationAutre: str(init.authentificationAutre),
  openSource: Boolean(init.openSource ?? false),
  devInterne: Boolean(init.devInterne ?? false),
  maintenueAJour: str(init.maintenueAJour),
  url: str(init.url),
  siteWeb: str(init.siteWeb),
  depotUrl: str(init.depotUrl),
  dateMiseEnService: str(init.dateMiseEnService),
  dateFinDeSupport: str(init.dateFinDeSupport),
  editeurId: str(init.editeurId),
  poleId: str(init.poleId),
  responsableId: str(init.responsableId),
  responsableOrgaType: str(init.responsableOrgaType),
  responsableOrgaId: str(init.responsableOrgaId),
  homologuee: Boolean(init.homologuee ?? false),
  dateHomologation: str(init.dateHomologation),
  dateRevueHomologation: str(init.dateRevueHomologation),
})

// --- Relations (intégrées au formulaire, enregistrées avec la fiche) ---
type DeployRow = { serveurId: string, role: string, rolePrecision: string, environnement: string }
type RespRow = { personneId: string, role: string }
const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[]

const deploiements = reactive<DeployRow[]>(
  arr(init.deploiements).map(d => ({ serveurId: str(d.serveurId), role: str(d.role), rolePrecision: str(d.rolePrecision), environnement: str(d.environnement) })),
)
const responsabilites = reactive<RespRow[]>(
  arr(init.responsabilites).map(r => ({ personneId: str(r.personneId), role: str(r.role) })),
)
const idsOf = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
const multi = reactive<Record<string, string[]>>({
  technologieIds: idsOf(init.technologieIds),
  prestataireIds: idsOf(init.prestataireIds),
  populationIds: idsOf(init.populationIds),
  groupeIds: idsOf(init.groupeIds),
})
const draftAdd = reactive<Record<string, string>>({ technologieIds: '', prestataireIds: '', populationIds: '', groupeIds: '' })

const multiRels = computed(() => [
  { key: 'technologieIds', title: 'Technologies', options: props.refs?.technologies ?? [] },
  { key: 'prestataireIds', title: 'Prestataires', options: props.refs?.tiers ?? [] },
  { key: 'populationIds', title: 'Populations concernées', options: props.refs?.populations ?? [] },
  { key: 'groupeIds', title: 'Groupes concernés', options: props.refs?.groupes ?? [] },
])
const optLabel = (options: EnumOption[], value: string) => options.find(o => o.value === value)?.label ?? value
const availableFor = (options: EnumOption[], key: string) => options.filter(o => !multi[key]!.includes(o.value))
const addMulti = (key: string) => {
  const v = draftAdd[key]
  if (v && !multi[key]!.includes(v)) multi[key]!.push(v)
  draftAdd[key] = ''
}
const removeMulti = (key: string, value: string) => {
  multi[key] = multi[key]!.filter(x => x !== value)
}

// Responsable organisationnel : options selon le type choisi.
const orgaOptions = computed<EnumOption[]>(() => {
  const map: Record<string, EnumOption[] | undefined> = {
    pole: props.refs?.poles,
    composante: props.refs?.composantes,
    service: props.refs?.services,
    departement: props.refs?.departements,
  }
  return map[form.responsableOrgaType] ?? []
})
watch(() => form.responsableOrgaType, () => {
  form.responsableOrgaId = ''
})

// '' → null pour les champs optionnels (l'API valide des enums, pas la chaîne vide).
const clean = (v: unknown) => (v === '' ? null : v)

const onSubmit = () => {
  emit('submit', {
    nom: form.nom,
    description: clean(form.description),
    categorie: form.categorie,
    categoriePrecision: form.categorie === 'autre' ? (form.categoriePrecision || null) : null,
    criticite: clean(form.criticite),
    statut: form.statut,
    hebergement: clean(form.hebergement),
    exposition: clean(form.exposition),
    sensibilite: clean(form.sensibilite),
    donneesPersonnelles: form.donneesPersonnelles,
    // Décocher « données personnelles » remet le volet à zéro : conserver une analyse
    // d'impact sur un traitement qui n'en est plus un laisserait une trace trompeuse.
    rgpd: form.donneesPersonnelles ? form.rgpd : null,
    rgpdExigences: form.donneesPersonnelles ? form.rgpdExigences : [],
    authentification: form.authentification.length ? form.authentification : null,
    authentificationAutre: form.authentification.includes('autre') ? (form.authentificationAutre || null) : null,
    openSource: form.openSource,
    devInterne: form.devInterne,
    maintenueAJour: clean(form.maintenueAJour),
    url: clean(form.url),
    siteWeb: clean(form.siteWeb),
    depotUrl: clean(form.depotUrl),
    dateMiseEnService: clean(form.dateMiseEnService),
    dateFinDeSupport: clean(form.dateFinDeSupport),
    editeurId: clean(form.editeurId),
    poleId: clean(form.poleId),
    responsableId: clean(form.responsableId),
    responsableOrgaType: clean(form.responsableOrgaType),
    responsableOrgaId: form.responsableOrgaType ? clean(form.responsableOrgaId) : null,
    homologuee: form.homologuee,
    dateHomologation: clean(form.dateHomologation),
    dateRevueHomologation: clean(form.dateRevueHomologation),
    // Relations
    deploiements: deploiements
      .filter(d => d.serveurId && d.role)
      .map(d => ({ serveurId: d.serveurId, role: d.role, rolePrecision: d.role === 'autre' ? (d.rolePrecision || null) : null, environnement: d.environnement || null })),
    responsabilites: responsabilites.filter(r => r.personneId && r.role),
    technologieIds: multi.technologieIds,
    prestataireIds: multi.prestataireIds,
    populationIds: multi.populationIds,
    groupeIds: multi.groupeIds,
  })
}

const labelCls = 'block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
const inputCls = 'w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2.5 text-sm text-secondary-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const checkCls = 'flex items-center gap-2.5 text-sm text-secondary-700'
const chipCls = 'inline-flex items-center gap-1 rounded-md border border-primary-200/60 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700'
const grid = 'grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2'
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div class="overflow-hidden rounded-2xl border border-secondary-200/80 bg-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)]">
      <fieldset
        :disabled="readOnly"
        class="m-0 min-w-0 border-0 p-0"
      >
        <!-- 01 · Identité -->
        <FormSection
          :n="1"
          title="Identité"
        >
          <div :class="grid">
            <div class="space-y-2 sm:col-span-2">
              <label
                :class="labelCls"
                for="nom"
              >Nom *</label>
              <input
                id="nom"
                v-model="form.nom"
                required
                :class="inputCls"
              >
            </div>
            <div class="space-y-2 sm:col-span-2">
              <label
                :class="labelCls"
                for="description"
              >Description</label>
              <textarea
                id="description"
                v-model="form.description"
                rows="3"
                :class="inputCls"
              />
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="categorie"
              >Catégorie *</label>
              <select
                id="categorie"
                v-model="form.categorie"
                required
                :class="inputCls"
              >
                <option
                  v-for="o in appCategories"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
              <input
                v-if="form.categorie === 'autre'"
                v-model="form.categoriePrecision"
                placeholder="Précisez la catégorie"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="statut"
              >Statut</label>
              <select
                id="statut"
                v-model="form.statut"
                :class="inputCls"
              >
                <option
                  v-for="o in appStatuts"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="url"
              >URL de l'application</label>
              <input
                id="url"
                v-model="form.url"
                type="url"
                placeholder="https://…"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="siteWeb"
              >Site web du produit</label>
              <input
                id="siteWeb"
                v-model="form.siteWeb"
                type="url"
                placeholder="https://…"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="criticite"
              >Criticité</label>
              <select
                id="criticite"
                v-model="form.criticite"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in appCriticites"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
          </div>
        </FormSection>

        <!-- 02 · Sécurité & données -->
        <FormSection
          :n="2"
          title="Sécurité & données"
          tint
        >
          <div :class="grid">
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="sensibilite"
              >Sensibilité des données</label>
              <select
                id="sensibilite"
                v-model="form.sensibilite"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in appSensibilites"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="exposition"
              >Exposition</label>
              <select
                id="exposition"
                v-model="form.exposition"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in appExpositions"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <label
              class="sm:col-span-2"
              :class="checkCls"
            >
              <input
                v-model="form.donneesPersonnelles"
                type="checkbox"
                class="size-4 accent-primary-600"
              >
              Traite des données personnelles (RGPD)
            </label>

            <!-- Volet RGPD : ne s'ouvre que si le traitement est déclaré. Poser ces
                 questions sur les autres fiches serait du bruit. -->
            <div
              v-if="form.donneesPersonnelles"
              class="sm:col-span-2"
            >
              <FormRgpd
                :bloc="form.rgpd"
                :etats="form.rgpdExigences"
                :application-id="applicationId"
                @update:bloc="form.rgpd = $event"
                @update:etats="form.rgpdExigences = $event"
              />
            </div>
          </div>
        </FormSection>

        <!-- 03 · Authentification -->
        <FormSection
          :n="3"
          title="Authentification"
        >
          <div class="flex flex-wrap gap-2">
            <label
              v-for="o in authMethodes"
              :key="o.value"
              class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-secondary-200 bg-secondary-50/40 px-3 py-2 text-sm text-secondary-700 transition-colors has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50 has-[:checked]:text-primary-800"
            >
              <input
                v-model="form.authentification"
                type="checkbox"
                :value="o.value"
                class="size-4 accent-primary-600"
              >
              {{ o.label }}
            </label>
          </div>
          <input
            v-if="form.authentification.includes('autre')"
            v-model="form.authentificationAutre"
            placeholder="Précisez la méthode d'authentification"
            :class="[inputCls, 'mt-3 sm:max-w-md']"
          >
        </FormSection>

        <!-- 04 · Technique & cycle de vie -->
        <FormSection
          :n="4"
          title="Technique & cycle de vie"
          tint
        >
          <div :class="grid">
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="hebergement"
              >Hébergement</label>
              <select
                id="hebergement"
                v-model="form.hebergement"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in appHebergements"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="maintenue"
              >Mise à jour</label>
              <select
                id="maintenue"
                v-model="form.maintenueAJour"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in appMaintenances"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="mes"
              >Mise en service</label>
              <input
                id="mes"
                v-model="form.dateMiseEnService"
                type="date"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="fds"
              >Fin de support</label>
              <input
                id="fds"
                v-model="form.dateFinDeSupport"
                type="date"
                :class="inputCls"
              >
            </div>
            <label :class="checkCls">
              <input
                v-model="form.openSource"
                type="checkbox"
                class="size-4 accent-primary-600"
              > Open source
            </label>
            <label :class="checkCls">
              <input
                v-model="form.devInterne"
                type="checkbox"
                class="size-4 accent-primary-600"
              > Développement interne
            </label>
            <div
              v-if="form.openSource || form.devInterne"
              class="space-y-2 sm:col-span-2"
            >
              <label
                :class="labelCls"
                for="depot"
              >Dépôt Git / code source</label>
              <input
                id="depot"
                v-model="form.depotUrl"
                type="url"
                placeholder="https://git…"
                :class="inputCls"
              >
            </div>
          </div>
        </FormSection>

        <!-- 05 · Homologation -->
        <FormSection
          :n="5"
          title="Homologation"
        >
          <div :class="grid">
            <label
              class="sm:col-span-2"
              :class="checkCls"
            >
              <input
                v-model="form.homologuee"
                type="checkbox"
                class="size-4 accent-primary-600"
              >
              Application homologuée
            </label>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="dateHomol"
              >Date d'homologation</label>
              <input
                id="dateHomol"
                v-model="form.dateHomologation"
                type="date"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="dateRevue"
              >Prochaine revue</label>
              <input
                id="dateRevue"
                v-model="form.dateRevueHomologation"
                type="date"
                :class="inputCls"
              >
            </div>
          </div>
        </FormSection>

        <!-- 06 · Rattachements -->
        <FormSection
          v-if="refs"
          :n="6"
          title="Rattachements"
          tint
        >
          <div :class="grid">
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="editeur"
              >Éditeur</label>
              <select
                id="editeur"
                v-model="form.editeurId"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in refs.tiers"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="pole"
              >Pôle pilote</label>
              <select
                id="pole"
                v-model="form.poleId"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in refs.poles"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="responsable"
              >Responsable principal (personne)</label>
              <select
                id="responsable"
                v-model="form.responsableId"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in refs.personnes"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="respOrgaType"
              >Responsable (organisation)</label>
              <select
                id="respOrgaType"
                v-model="form.responsableOrgaType"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in orgaTypes"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div
              v-if="form.responsableOrgaType"
              class="space-y-2"
            >
              <label
                :class="labelCls"
                for="respOrgaId"
              >{{ orgaTypes.find(o => o.value === form.responsableOrgaType)?.label }}</label>
              <select
                id="respOrgaId"
                v-model="form.responsableOrgaId"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in orgaOptions"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
          </div>
        </FormSection>

        <!-- 07 · Serveurs & déploiements -->
        <FormSection
          v-if="refs"
          :n="7"
          title="Serveurs & déploiements"
        >
          <div
            v-if="!deploiements.length"
            class="mb-3 text-sm text-secondary-400"
          >
            Aucun déploiement.
          </div>
          <div class="space-y-3">
            <div
              v-for="(row, i) in deploiements"
              :key="i"
              class="flex flex-wrap items-end gap-3 rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3"
            >
              <div class="flex flex-1 flex-col gap-1.5">
                <label :class="labelCls">Serveur</label>
                <select
                  v-model="row.serveurId"
                  :class="inputCls"
                >
                  <option value="">
                    —
                  </option>
                  <option
                    v-for="o in refs.serveurs"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
              </div>
              <div class="flex flex-col gap-1.5">
                <label :class="labelCls">Rôle</label>
                <select
                  v-model="row.role"
                  :class="inputCls"
                >
                  <option value="">
                    —
                  </option>
                  <option
                    v-for="o in deploiementRoles"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
                <input
                  v-if="row.role === 'autre'"
                  v-model="row.rolePrecision"
                  placeholder="Précisez le rôle"
                  :class="inputCls"
                >
              </div>
              <div class="flex flex-col gap-1.5">
                <label :class="labelCls">Environnement</label>
                <select
                  v-model="row.environnement"
                  :class="inputCls"
                >
                  <option value="">
                    —
                  </option>
                  <option
                    v-for="o in environnements"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
              </div>
              <button
                type="button"
                aria-label="Retirer"
                class="mb-2.5 text-secondary-400 hover:text-red-600"
                @click="deploiements.splice(i, 1)"
              >
                <Icon
                  name="lucide:x"
                  class="size-5"
                />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-secondary-200 bg-white px-3 py-1.5 text-sm text-secondary-700 shadow-sm transition-colors hover:bg-secondary-50"
            @click="deploiements.push({ serveurId: '', role: '', rolePrecision: '', environnement: '' })"
          >
            <Icon
              name="lucide:plus"
              class="size-4"
            /> Ajouter un déploiement
          </button>
        </FormSection>

        <!-- 08 · Responsables -->
        <FormSection
          v-if="refs"
          :n="8"
          title="Responsables"
          tint
        >
          <div
            v-if="!responsabilites.length"
            class="mb-3 text-sm text-secondary-400"
          >
            Aucun responsable.
          </div>
          <div class="space-y-3">
            <div
              v-for="(row, i) in responsabilites"
              :key="i"
              class="flex flex-wrap items-end gap-3 rounded-xl border border-secondary-200/70 bg-white p-3"
            >
              <div class="flex flex-1 flex-col gap-1.5">
                <label :class="labelCls">Personne</label>
                <select
                  v-model="row.personneId"
                  :class="inputCls"
                >
                  <option value="">
                    —
                  </option>
                  <option
                    v-for="o in refs.personnes"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
              </div>
              <div class="flex flex-col gap-1.5">
                <label :class="labelCls">Rôle</label>
                <select
                  v-model="row.role"
                  :class="inputCls"
                >
                  <option value="">
                    —
                  </option>
                  <option
                    v-for="o in responsabiliteRoles"
                    :key="o.value"
                    :value="o.value"
                  >
                    {{ o.label }}
                  </option>
                </select>
              </div>
              <button
                type="button"
                aria-label="Retirer"
                class="mb-2.5 text-secondary-400 hover:text-red-600"
                @click="responsabilites.splice(i, 1)"
              >
                <Icon
                  name="lucide:x"
                  class="size-5"
                />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-secondary-200 bg-white px-3 py-1.5 text-sm text-secondary-700 shadow-sm transition-colors hover:bg-secondary-50"
            @click="responsabilites.push({ personneId: '', role: '' })"
          >
            <Icon
              name="lucide:plus"
              class="size-4"
            /> Ajouter un responsable
          </button>
        </FormSection>

        <!-- 09 · Liens -->
        <FormSection
          v-if="refs"
          :n="9"
          title="Liens"
        >
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div
              v-for="m in multiRels"
              :key="m.key"
              class="space-y-2"
            >
              <label :class="labelCls">{{ m.title }}</label>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="v in multi[m.key]"
                  :key="v"
                  :class="chipCls"
                >
                  {{ optLabel(m.options, v) }}
                  <button
                    type="button"
                    aria-label="Retirer"
                    class="text-primary-400 hover:text-red-600"
                    @click="removeMulti(m.key, v)"
                  >
                    <Icon
                      name="lucide:x"
                      class="size-3.5"
                    />
                  </button>
                </span>
                <span
                  v-if="!multi[m.key]!.length"
                  class="text-sm text-secondary-400"
                >Aucun.</span>
              </div>
              <select
                v-model="draftAdd[m.key]"
                :class="inputCls"
                @change="addMulti(m.key)"
              >
                <option value="">
                  Ajouter…
                </option>
                <option
                  v-for="o in availableFor(m.options, m.key)"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
          </div>
        </FormSection>
      </fieldset>

      <!-- Barre d'action -->
      <div class="flex items-center justify-end gap-3 border-t border-secondary-100 bg-secondary-50/60 p-6 sm:px-8 sm:py-5">
        <UIButton
          type="button"
          variant="outline"
          @click="emit('cancel')"
        >
          {{ readOnly ? 'Retour' : 'Annuler' }}
        </UIButton>
        <UIButton
          v-if="!readOnly"
          type="submit"
          variant="primary"
          :disabled="saving"
          class="font-medium tracking-tight shadow-sm shadow-primary-500/20 transition-all duration-300 hover:shadow-md hover:shadow-primary-500/30"
        >
          {{ saving ? 'Enregistrement…' : (submitLabel ?? 'Enregistrer') }}
        </UIButton>
      </div>
    </div>
  </form>
</template>
