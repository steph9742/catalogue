<script setup lang="ts">
import { UIButton, UITabs, UITabsItem } from '@catalogue/ui'
import DetailSection from '~/components/detail/DetailSection.vue'
import DetailField from '~/components/detail/DetailField.vue'
import ChangeTimeline from '~/components/detail/ChangeTimeline.vue'
import FicheExportMenu from '~/components/detail/FicheExportMenu.vue'
import Pill from '~/components/ui/Pill.vue'
import type { FicheDoc } from '~/utils/ficheExport'
import { labelOf, labelOfAutre, logicielCategories, logicielLicences, logicielInstallations, logicielStatuts } from '~/utils/catalogueEnums'

const route = useRoute()
const eden = useEden()
const api = useApi()
const id = route.params.id as string

const { data: logiciel } = await useAsyncData(`logiciel-${id}`, async () => {
  const { data } = await eden.api.postes({ id }).get()
  return data ?? null
}, { getCachedData: () => undefined })

// `populations` passe par le CRUD générique, donc hors du type eden : on l'appelle
// via useApi(), comme le reste de l'application.
const { data: populations } = await useAsyncData(
  'populations',
  () => api<{ id: string, nom: string }[]>('/api/populations'),
  { getCachedData: () => undefined },
)

const perms = await usePermissions()
const proposable = computed(() => perms.canPropose('postes'))
const tab = ref('details')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data: history } = await useAsyncData(`audit-postes-${id}`, () => api<any[]>(`/api/audit/postes/${id}`), { getCachedData: () => undefined })
// LE NOM DE LA FICHE DANS L'ONGLET. Sans lui, douze onglets ouverts s'appellent tous
// « Logiciels postes de travail » : le titre dérivé du menu nomme le catalogue, pas l'enregistrement.
useHead({ title: () => logiciel.value?.nom })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const l = computed(() => logiciel.value as any)
const statutTone = (v: string) => ({ autorise: 'emerald', sur_derogation: 'amber', retire: 'gray' }[v] ?? 'gray')
const installTone = (v: string) => ({ deploiement_centralise: 'primary', libre_service: 'blue', sur_demande: 'amber' }[v] ?? 'gray')
const catIcon = (v: string) => ({
  navigateur: 'lucide:globe', bureautique: 'lucide:file-text', messagerie: 'lucide:mail',
  securite: 'lucide:shield-check', metier: 'lucide:briefcase', utilitaire: 'lucide:wrench',
  multimedia: 'lucide:clapperboard', developpement: 'lucide:code-2', autre: 'lucide:package',
}[v] ?? 'lucide:package')
const popNames = computed(() => {
  const map = new Map((populations.value ?? []).map(p => [p.id, p.nom]))
  return (l.value?.populationIds ?? []).map((i: string) => map.get(i) ?? i)
})
const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//.test(v)

const exportDoc = computed<FicheDoc>(() => {
  const it = l.value
  if (!it) return { title: '—', sections: [] }
  return {
    title: it.nom,
    subtitle: it.editeur ? `${it.editeur}${it.version ? ' · ' + it.version : ''}` : undefined,
    pills: [
      { text: labelOfAutre(logicielCategories, it.categorie, it.categoriePrecision), tone: 'primary' },
      { text: labelOf(logicielStatuts, it.statut), tone: statutTone(it.statut) },
      ...(it.typeLicence ? [{ text: labelOfAutre(logicielLicences, it.typeLicence, it.typeLicencePrecision), tone: 'blue' }] : []),
    ],
    sections: [
      { title: 'Logiciel', rows: [
        { label: 'Éditeur', value: it.editeur || '—' },
        { label: 'Version', value: it.version || '—' },
        { label: 'Catégorie', value: labelOfAutre(logicielCategories, it.categorie, it.categoriePrecision) },
        { label: 'Type de licence', value: it.typeLicence ? labelOfAutre(logicielLicences, it.typeLicence, it.typeLicencePrecision) : '—' },
        { label: 'Installation', value: it.installation ? labelOf(logicielInstallations, it.installation) : '—' },
        { label: 'Statut', value: labelOf(logicielStatuts, it.statut) },
        { label: 'Lien éditeur', value: it.url || '—' },
        { label: 'Description', value: it.description || '—' },
        { label: 'Notes', value: it.notes || '—' },
      ] },
      { title: 'Populations autorisées', lines: popNames.value.length ? popNames.value : undefined },
    ],
  }
})

const remove = async () => {
  if (!confirm('Supprimer ce logiciel ?')) return
  const { data } = await eden.api.postes({ id }).delete()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((data as any)?.queued) alert('Votre demande de suppression a été envoyée pour validation.')
  await refreshNuxtData('logiciels-poste')
  await navigateTo('/postes')
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <div
      v-if="!l"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Logiciel introuvable.
    </div>
    <template v-else>
      <div class="flex items-center gap-2 text-sm text-secondary-500">
        <NuxtLink
          href="/postes"
          class="hover:text-secondary-800"
        >Logiciels postes de travail</NuxtLink>
        <Icon
          name="lucide:chevron-right"
          class="size-4"
        />
        <span class="text-secondary-700">{{ l.nom }}</span>
      </div>

      <!-- Bandeau -->
      <div class="relative rounded-2xl border border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40 p-6 shadow-sm">
        <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div class="absolute -right-12 -top-16 size-52 rounded-full bg-primary-300/20 blur-3xl" />
        </div>
        <div class="relative flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-4">
            <div class="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary-200/60 bg-white text-primary-600 shadow-sm">
              <Icon
                :name="catIcon(l.categorie)"
                class="size-7"
              />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2.5">
                <h1 class="text-2xl font-semibold tracking-tight text-secondary-900">
                  {{ l.nom }}
                </h1>
                <Pill tone="primary">
                  {{ labelOfAutre(logicielCategories, l.categorie, l.categoriePrecision) }}
                </Pill>
              </div>
              <p
                v-if="l.editeur"
                class="mt-1 text-sm text-secondary-600"
              >
                {{ l.editeur }}<span
                  v-if="l.version"
                  class="text-secondary-400"
                > · v{{ l.version }}</span>
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <Pill :tone="statutTone(l.statut)">
                  {{ labelOf(logicielStatuts, l.statut) }}
                </Pill>
                <Pill
                  v-if="l.typeLicence"
                  tone="blue"
                >
                  {{ labelOfAutre(logicielLicences, l.typeLicence, l.typeLicencePrecision) }}
                </Pill>
                <Pill
                  v-if="l.installation"
                  :tone="installTone(l.installation)"
                >
                  {{ labelOf(logicielInstallations, l.installation) }}
                </Pill>
              </div>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <FicheExportMenu :doc="exportDoc" />
            <template v-if="proposable">
              <UIButton
                variant="outline"
                size="md"
                class="group font-mono shadow-sm transition-all duration-300 hover:shadow-md"
                @click="navigateTo(`/postes/${id}/edit`)"
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
        <a
          v-if="isHttp(l.url)"
          :href="l.url"
          target="_blank"
          rel="noopener"
          class="relative mt-4 inline-flex items-center gap-1.5 rounded-lg border border-primary-200/70 bg-white/70 px-3 py-1.5 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:bg-white"
        >
          <Icon
            name="lucide:external-link"
            class="size-4"
          /> Site éditeur
        </a>
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

      <!-- Onglet Détails -->
      <div
        v-show="tab === 'details'"
        class="space-y-5"
      >
        <DetailSection
          v-if="l.description || l.notes"
          title="Présentation"
          icon="lucide:align-left"
        >
          <p
            v-if="l.description"
            class="text-sm leading-relaxed text-secondary-700"
          >
            {{ l.description }}
          </p>
          <div
            v-if="l.notes"
            class="rounded-xl border border-amber-200/60 bg-amber-50/50 p-3"
          >
            <div class="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-amber-600">
              <Icon
                name="lucide:sticky-note"
                class="size-3.5"
              /> Notes
            </div>
            <p class="text-sm leading-relaxed text-amber-900/90">
              {{ l.notes }}
            </p>
          </div>
        </DetailSection>

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <DetailSection
            title="Caractéristiques"
            icon="lucide:sliders-horizontal"
          >
            <DetailField
              label="Éditeur"
              :value="l.editeur"
            />
            <DetailField
              label="Version"
              :value="l.version"
            />
            <DetailField
              label="Type de licence"
              :value="l.typeLicence ? labelOfAutre(logicielLicences, l.typeLicence, l.typeLicencePrecision) : null"
            />
            <DetailField
              label="Installation"
              :value="l.installation ? labelOf(logicielInstallations, l.installation) : null"
            />
            <DetailField
              label="Statut"
              :value="labelOf(logicielStatuts, l.statut)"
            />
            <DetailField label="Lien éditeur">
              <a
                v-if="isHttp(l.url)"
                :href="l.url"
                target="_blank"
                rel="noopener"
                class="text-primary-600 hover:underline"
              >{{ l.url }}</a>
              <span v-else-if="l.url">{{ l.url }}</span>
              <span
                v-else
                class="text-secondary-300"
              >—</span>
            </DetailField>
          </DetailSection>

          <DetailSection
            title="Populations autorisées"
            icon="lucide:users-round"
          >
            <DetailField
              label="Populations"
              wide
            >
              <div
                v-if="popNames.length"
                class="flex flex-wrap gap-2"
              >
                <span
                  v-for="n in popNames"
                  :key="n"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-primary-200/60 bg-primary-50/60 px-2.5 py-1 text-xs font-medium text-primary-700"
                >
                  <Icon
                    name="lucide:users-round"
                    class="size-3.5"
                  /> {{ n }}
                </span>
              </div>
              <span
                v-else
                class="text-secondary-300"
              >Aucune population — logiciel non restreint.</span>
            </DetailField>
          </DetailSection>
        </div>
      </div>

      <!-- Onglet Chronologie -->
      <div v-show="tab === 'history'">
        <DetailSection
          title="Chronologie des modifications"
          icon="lucide:history"
        >
          <ChangeTimeline
            entite="postes"
            :history="history"
          />
        </DetailSection>
      </div>
    </template>
  </div>
</template>
