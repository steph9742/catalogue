<script setup lang="ts">
import { reactive } from 'vue'
import { UIButton, UITabs, UITabsItem } from '@catalogue/ui'
import { catalogues } from '~/utils/catalogues'
import { labelOf, labelOfAutre } from '~/utils/catalogueEnums'
import DetailSection from '~/components/detail/DetailSection.vue'
import DetailField from '~/components/detail/DetailField.vue'
import ChangeTimeline from '~/components/detail/ChangeTimeline.vue'
import FicheExportMenu from '~/components/detail/FicheExportMenu.vue'
import PersonneReferents from '~/components/detail/PersonneReferents.vue'
import PersonneRoles from '~/components/detail/PersonneRoles.vue'
import EntiteResponsables from '~/components/detail/EntiteResponsables.vue'
import RisqueActifs from '~/components/detail/RisqueActifs.vue'
import RisqueMesures from '~/components/detail/RisqueMesures.vue'
import PerimetreSmsi from '~/components/detail/PerimetreSmsi.vue'
import ActifDependances from '~/components/detail/ActifDependances.vue'
import ActifInfoApplications from '~/components/detail/ActifInfoApplications.vue'
import Nis2Actions from '~/components/detail/Nis2Actions.vue'
import Nis2Responsables from '~/components/detail/Nis2Responsables.vue'
import Nis2Mesures from '~/components/detail/Nis2Mesures.vue'
import Nis2CorrespondanceIso from '~/components/detail/Nis2CorrespondanceIso.vue'
import PiecesJointes from '~/components/detail/PiecesJointes.vue'
import ActifIncidents from '~/components/detail/ActifIncidents.vue'
import type { FicheDoc } from '~/utils/ficheExport'

// Catalogues acceptant des pièces jointes : ceux où l'on doit produire une PREUVE
// (conformité, audit, gouvernance). Inutile de les proposer sur un inventaire matériel.
const PJ_CATALOGUES = new Set([
  'exigences-nis2', 'actions-nis2', 'mesures-smsi', 'risques-smsi',
  'documents-smsi', 'audits-smsi', 'revues-direction', 'non-conformites',
  'objectifs-smsi', 'exigences-legales', 'opportunites',
])

const route = useRoute()
const key = route.params.catalogue as string
const id = route.params.id as string
const config = catalogues[key]
if (!config) throw createError({ statusCode: 404, statusMessage: 'Catalogue inconnu' })

const api = useApi()
const perms = await usePermissions()
const proposable = computed(() => perms.canPropose(config.key))
const tab = ref('details')

const { data: item } = await useAsyncData(`cat-${key}-${id}`, () =>
  api<Record<string, unknown>>(`/api/${config.endpoint}/${id}`),
{ getCachedData: () => undefined })

const refOptions = reactive<Record<string, { value: string, label: string }[]>>({})
for (const f of config.fields.filter(f => f.type === 'ref' && f.endpoint)) {
  refOptions[f.endpoint!] = await useRefLabels(f.endpoint!, f.labelKey)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data: history } = await useAsyncData(`audit-${key}-${id}`, () => api<any[]>(`/api/audit/${config.endpoint}/${id}`), { getCachedData: () => undefined })
// LE NOM DE LA FICHE DANS L'ONGLET. Sans lui, douze onglets ouverts s'appellent tous
// « Serveurs » : le titre dérivé du menu nomme le catalogue, pas l'enregistrement.
useHead({ title: () => titleOf.value })

// Titre incluant le parent (n-1) pour les unités d'organisation.
const selfLabels: Record<string, string> = {}
if (['poles', 'services', 'departements', 'composantes'].includes(config.endpoint)) {
  for (const o of await useRefLabels(config.endpoint)) selfLabels[o.value] = o.label
}
const titleOf = computed(() => {
  const it = item.value
  if (!it) return ''
  return selfLabels[String(it.id ?? id)] ?? String(it[config.naturalKey] ?? it.nom ?? id)
})
const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//.test(v)

// Catalogues promouvables dans le périmètre SMSI → type d'actif correspondant.
const SMSI_TYPE_BY_KEY: Record<string, string> = {
  'serveurs': 'serveur', 'applications': 'application', 'postes-travail': 'poste-travail',
  'iot': 'iot', 'machines-indus': 'machine-indus', 'equipements-reseau': 'equipement-reseau',
  'actifs-informationnels': 'actif-informationnel', 'processus': 'processus',
  'personnes': 'personne', 'lieux': 'lieu',
}
const smsiType = computed(() => SMSI_TYPE_BY_KEY[config.key])

// Catalogues dont les fiches peuvent porter des incidents Sniff : ceux que la
// synchronisation GLPI alimente, et donc les seuls à pouvoir porter un identifiant GLPI.
const CATALOGUES_MACHINES = new Set(['serveurs', 'postes-travail', 'appareils-mobiles', 'iot'])

// Champ conditionnel : visible si aucune condition, ou si l'une d'elles est vraie.
const visible = (f: typeof config.fields[number], it: Record<string, unknown>) =>
  !f.showIf || f.showIf.some(c => String(it[c.key] ?? '') === c.value)

// Valeur affichable d'un champ de config.
const fieldValue = (f: typeof config.fields[number], it: Record<string, unknown>): string | null => {
  const v = it[f.key]
  if (f.type === 'checkbox') return v ? 'Oui' : 'Non'
  if (f.type === 'select') return f.autreKey ? labelOfAutre(f.options ?? [], v as string, it[f.autreKey] as string) : labelOf(f.options ?? [], v as string)
  if (f.type === 'ref') return (refOptions[f.endpoint ?? '']?.find(o => o.value === v)?.label ?? null)
  return v == null || v === '' ? null : String(v)
}

// Document exportable (Markdown / ODT / PDF).
const exportDoc = computed<FicheDoc>(() => {
  const it = item.value
  if (!it) return { title: '—', sections: [] }
  return {
    title: titleOf.value,
    sections: [{
      title: config.label,
      rows: config.fields.filter(f => visible(f, it)).map(f => ({ label: f.label, value: fieldValue(f, it) ?? '—' })),
    }],
  }
})

// FIN DE SUPPORT — champ calculé par le serveur (décoration EOL des serveurs/postes) depuis le
// référentiel OS.
const dateFr = (iso: unknown) => {
  if (typeof iso !== 'string' || !iso) return null
  // Fuseau explicite : le rendu serveur vit en UTC, le navigateur à Paris.
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
}
// La couverture EDR vit dans <CouvertureEdr>, partagé avec les fiches composante, service et
// département : trois écrans différents pour la même mesure, et l'écrire ici l'aurait laissée
// diverger de celle des trois autres.
const AVEC_COUVERTURE = ['entites', 'composantes', 'services', 'departements']

const eolAlerte = computed(() => {
  const it = item.value
  if (!it) return null
  const os = it.os ? String(it.os) : 'Le système'
  if (it.eolStatut === 'depasse') {
    const d = dateFr(it.eolFinDeVie)
    return {
      cls: 'border-red-200 bg-red-50/70 text-red-800',
      icon: 'lucide:shield-x',
      titre: 'Système hors support',
      texte: `${os} ne reçoit plus de correctifs de sécurité${d ? ` depuis le ${d}` : ''}.`,
    }
  }
  if (it.eolStatut === 'etendu') {
    const d = dateFr(it.eolFinDeVieEtendue)
    return {
      cls: 'border-amber-200 bg-amber-50/70 text-amber-800',
      icon: 'lucide:shield-alert',
      titre: 'Sous support étendu',
      texte: `Le support standard de ${it.os} est terminé — la couverture tient au contrat étendu (ESU/ESM)${d ? `, jusqu'au ${d}` : ''}.`,
    }
  }
  if (it.eolStatut === 'bientot') {
    const d = dateFr(it.eolFinDeVie)
    return {
      cls: 'border-amber-200 bg-amber-50/70 text-amber-800',
      icon: 'lucide:calendar-clock',
      titre: 'Fin de support dans moins d\'un an',
      texte: `Le support de ${it.os} se termine${d ? ` le ${d}` : ' prochainement'} : planifier la migration.`,
    }
  }
  return null
})

// CRITICITÉ, EN ÉVIDENCE. Elle figurait uniquement dans la liste des champs, au milieu de vingt
// autres : sur une fiche de machine vitale, l'information la plus structurante était la plus
// discrète.
const CRITICITE_FORTE = new Set(['vitale', 'critique', 'essentielle'])
const TONS_CRITICITE: Record<string, string> = {
  vitale: 'border-red-300 bg-red-100 text-red-800',
  critique: 'border-orange-300 bg-orange-100 text-orange-800',
  essentielle: 'border-orange-200 bg-orange-50 text-orange-700',
  importante: 'border-amber-200 bg-amber-50 text-amber-700',
  secondaire: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  // Échelle de sûreté de fonctionnement (machines industrielles).
  mineure: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}
const criticiteFiche = computed(() => {
  const it = item.value
  if (!it) return null
  const champ = config.fields.find(f => (f.key === 'criticite' || f.key === 'criticiteSurete') && it[f.key])
  if (!champ) return null
  const valeur = String(it[champ.key])
  return {
    valeur,
    label: labelOf(champ.options ?? [], valeur),
    aide: champ.label,
    forte: CRITICITE_FORTE.has(valeur),
  }
})

const remove = async () => {
  if (!confirm('Supprimer cette entrée ?')) return
  const res = await api<{ queued?: boolean }>(`/api/${config.endpoint}/${id}`, { method: 'DELETE' })
  if (res?.queued) alert('Votre demande de suppression a été envoyée pour validation.')
  await refreshNuxtData(`cat-${key}`)
  await navigateTo(`/${config.key}`)
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <div
      v-if="!item"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Entrée introuvable.
    </div>
    <template v-else>
      <div class="flex items-center gap-2 text-sm text-secondary-500">
        <NuxtLink
          :href="`/${config.key}`"
          class="hover:text-secondary-800"
        >{{ config.label }}</NuxtLink>
        <Icon
          name="lucide:chevron-right"
          class="size-4"
        />
        <span class="text-secondary-700">{{ titleOf }}</span>
      </div>

      <!-- Bandeau -->
      <div class="relative rounded-2xl border border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40 p-6 shadow-sm">
        <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div class="absolute -right-12 -top-16 size-52 rounded-full bg-primary-300/20 blur-3xl" />
        </div>
        <div class="relative flex flex-wrap items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <Icon
              :name="config.icon"
              class="size-6 text-primary-600"
            />
            <div class="min-w-0">
              <h1 class="text-2xl font-semibold tracking-tight text-secondary-900">
                {{ titleOf }}
              </h1>
              <!-- Les niveaux forts portent une icône : sur une fiche parcourue vite, la
                   forme se lit avant la couleur, et la couleur avant le mot. -->
              <span
                v-if="criticiteFiche"
                class="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold"
                :class="TONS_CRITICITE[criticiteFiche.valeur] ?? 'border-secondary-200 bg-secondary-50 text-secondary-600'"
                :title="criticiteFiche.aide"
              >
                <Icon
                  v-if="criticiteFiche.forte"
                  name="lucide:shield-alert"
                  class="size-3.5"
                />
                {{ criticiteFiche.label }}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <FicheExportMenu :doc="exportDoc" />
            <template v-if="proposable">
              <UIButton
                variant="outline"
                size="md"
                class="group font-mono shadow-sm transition-all duration-300 hover:shadow-md"
                @click="navigateTo(`/${config.key}/${id}/edit`)"
              >
                <Icon
                  name="lucide:pencil-line"
                  class="text-base transition-transform group-hover:scale-110"
                />
                <span class="ml-1.5 font-medium tracking-tight">Modifier</span>
              </UIButton>
              <UIButton
                variant="danger"
                size="md"
                @click="remove"
              >
                <Icon
                  name="lucide:trash-2"
                  class="text-base"
                />
                <span class="ml-1.5 font-medium tracking-tight">Supprimer</span>
              </UIButton>
            </template>
          </div>
        </div>
      </div>

      <!-- Hors des onglets, pour la même raison que la fin de support : c'est une charge
           de travail, pas un détail de fiche. -->
      <CouvertureEdr
        v-if="AVEC_COUVERTURE.includes(config.key)"
        :id="id"
        :niveau="config.key === 'entites' ? 'entite' : config.key === 'composantes' ? 'composante' : config.key === 'services' ? 'service' : 'departement'"
      />

      <!-- Fin de support : visible sans ouvrir aucun onglet — c'est une information qui
           doit sauter aux yeux, pas se mériter. -->
      <div
        v-if="eolAlerte"
        class="flex flex-wrap items-start gap-3 rounded-2xl border p-4 text-sm shadow-sm"
        :class="eolAlerte.cls"
      >
        <Icon
          :name="eolAlerte.icon"
          class="mt-0.5 size-5 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="font-semibold tracking-tight">
            {{ eolAlerte.titre }}
          </p>
          <p class="mt-0.5">
            {{ eolAlerte.texte }}
          </p>
        </div>
        <NuxtLink
          to="/fin-de-vie"
          class="shrink-0 text-xs font-medium underline underline-offset-2 hover:opacity-80"
        >
          Fin de vie des systèmes
        </NuxtLink>
      </div>

      <UITabs
        v-model="tab"
        color="primary"
      >
        <UITabsItem value="details">
          Détails
        </UITabsItem>
        <UITabsItem value="history">
          Chronologie
        </UITabsItem>
      </UITabs>

      <div
        v-show="tab === 'details'"
        class="space-y-5"
      >
        <PersonneRoles
          v-if="config.key === 'personnes'"
          :personne-id="id"
        />
        <PersonneReferents
          v-if="config.key === 'personnes'"
          :personne-id="id"
          :editable="proposable"
        />
        <EntiteResponsables
          v-if="config.key === 'entites'"
          :entite-id="id"
          :editable="proposable"
        />
        <RisqueActifs
          v-if="config.key === 'risques-smsi'"
          :risque-id="id"
          :editable="proposable"
        />
        <RisqueMesures
          v-if="config.key === 'risques-smsi'"
          :risque-id="id"
          :editable="proposable"
        />
        <PerimetreSmsi
          v-if="smsiType && item"
          :type-source="smsiType"
          :source-id="id"
          :nom="titleOf"
          :editable="proposable"
        />
        <ActifDependances
          v-if="config.key === 'actifs-smsi'"
          :actif-id="id"
          :editable="proposable"
        />
        <ActifInfoApplications
          v-if="config.key === 'actifs-informationnels'"
          :actif-id="id"
          :editable="proposable"
        />
        <Nis2Actions
          v-if="config.key === 'exigences-nis2'"
          :exigence-id="id"
          :editable="proposable"
        />
        <Nis2Responsables
          v-if="config.key === 'exigences-nis2'"
          :exigence-id="id"
          :editable="proposable"
        />
        <Nis2Mesures
          v-if="config.key === 'exigences-nis2'"
          :exigence-id="id"
          :editable="proposable"
        />
        <Nis2CorrespondanceIso
          v-if="config.key === 'exigences-nis2'"
          :exigence-id="id"
        />
        <!-- Incidents Sniff, rapprochés par l'identifiant GLPI. Le volet dit lui-même quand le rapprochement est hors de portée : un vide muet se lirait à tort comme « aucun incident ». -->
        <ActifIncidents
          v-if="CATALOGUES_MACHINES.has(config.key)"
          :actif-id="id"
        />
        <!-- Preuves : partout où la conformité doit être démontrée. -->
        <PiecesJointes
          v-if="PJ_CATALOGUES.has(config.key)"
          :type-source="config.key"
          :source-id="id"
          :editable="proposable"
        />
        <DetailSection
          title="Détails"
          :icon="config.icon"
        >
          <template
            v-for="f in config.fields"
            :key="f.key"
          >
            <DetailField
              v-if="visible(f, item)"
              :label="f.label"
              :wide="f.type === 'textarea'"
            >
              <a
                v-if="isHttp(fieldValue(f, item))"
                :href="fieldValue(f, item)!"
                target="_blank"
                rel="noopener"
                class="text-primary-600 hover:underline"
              >{{ fieldValue(f, item) }}</a>
              <span v-else-if="fieldValue(f, item)">{{ fieldValue(f, item) }}</span>
              <span
                v-else
                class="text-secondary-300"
              >—</span>
            </DetailField>
          </template>
        </DetailSection>
      </div>

      <div v-show="tab === 'history'">
        <DetailSection
          title="Chronologie des modifications"
          icon="lucide:history"
        >
          <ChangeTimeline
            :entite="config.key"
            :history="history"
          />
        </DetailSection>
      </div>
    </template>
  </div>
</template>
