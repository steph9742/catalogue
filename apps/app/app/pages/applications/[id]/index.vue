<script setup lang="ts">
import { UIButton, UITabs, UITabsItem } from '@catalogue/ui'
import DetailSection from '~/components/detail/DetailSection.vue'
import DetailField from '~/components/detail/DetailField.vue'
import ChangeTimeline from '~/components/detail/ChangeTimeline.vue'
// IMPORT EXPLICITE, comme tout le reste du dépôt. L'auto-import de Nuxt préfixe par le dossier
// — ce composant s'appellerait `DetailApplicationRgpd`.
import ApplicationRgpd from '~/components/detail/ApplicationRgpd.vue'
import FicheExportMenu from '~/components/detail/FicheExportMenu.vue'
import Pill from '~/components/ui/Pill.vue'
import type { FicheDoc } from '~/utils/ficheExport'
import {
  labelOf, labelOfAutre,
  appCategories, appCriticites, appStatuts, appHebergements, appExpositions,
  appSensibilites, appMaintenances, authMethodes,
  deploiementRoles, environnements, responsabiliteRoles,
} from '~/utils/catalogueEnums'
import { appStatutTone, appCriticiteTone, appExpositionTone } from '~/utils/pillTones'

const route = useRoute()
const eden = useEden()
const api = useApi()
const id = route.params.id as string

const { data: application } = await useAsyncData(`application-${id}`, async () => {
  const { data } = await eden.api.applications({ id }).get()
  return data ?? null
}, { getCachedData: () => undefined })

const refs = await useRefOptions()
const perms = await usePermissions()
const proposable = computed(() => perms.canPropose('applications'))

const tab = ref('details')

// LES SERVICES EXPOSÉS DE L'APPLICATION. Un compte sans droit sur les sites et services ne
// casse pas la fiche : la section disparaît.
type ServiceApp = { id: string, hote: string, port: number, libelle: string | null, classement: string | null, signalements: string[] }
const { data: servicesApp } = await useAsyncData(
  `app-services-${id}`,
  () => api<{ resultats: ServiceApp[] }>('/api/sites-services/liste', { query: { applicationId: id } }).catch(() => null),
  { getCachedData: () => undefined },
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data: history } = await useAsyncData(`audit-app-${id}`, () => api<any[]>(`/api/audit/applications/${id}`), { getCachedData: () => undefined })
// LE NOM DE LA FICHE DANS L'ONGLET. Sans lui, douze onglets ouverts s'appellent tous
// « Applications » : le titre dérivé du menu nomme le catalogue, pas l'enregistrement.
useHead({ title: () => application.value?.nom })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const app = computed(() => application.value as any)
const nameOf = (opts: { value: string, label: string }[], v: string | null | undefined) =>
  (v ? opts.find(o => o.value === v)?.label ?? '—' : '—')
const namesOf = (opts: { value: string, label: string }[], ids: string[] | undefined) =>
  (ids ?? []).map(i => opts.find(o => o.value === i)?.label ?? i)
const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//.test(v)

// Responsable organisationnel (pôle / composante / service / département).
const orgaTypeLabels: Record<string, string> = { pole: 'Pôle', composante: 'Composante', service: 'Service', departement: 'Département' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orgaName = (a: any): string | null => {
  const t = a?.responsableOrgaType
  if (!t) return null
  const list = { pole: refs.poles, composante: refs.composantes, service: refs.services, departement: refs.departements }[t as string] ?? []
  const n = nameOf(list, a.responsableOrgaId)
  return `${orgaTypeLabels[t] ?? t} · ${n}`
}

const chip = 'inline-flex items-center rounded-md border border-secondary-200/70 bg-secondary-50 px-2 py-0.5 text-xs font-medium text-secondary-700'

// Document exportable (Markdown / ODT / PDF) — fiche complète.
const exportDoc = computed<FicheDoc>(() => {
  const a = app.value
  if (!a) return { title: '—', sections: [] }
  const yn = (b: unknown) => (b ? 'Oui' : 'Non')
  const auth = (a.authentification ?? []).map((m: string) => (m === 'autre' && a.authentificationAutre ? `Autre : ${a.authentificationAutre}` : labelOf(authMethodes, m)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dep = (a.deploiements ?? []).map((d: any) => `${nameOf(refs.serveurs, d.serveurId)} · ${labelOfAutre(deploiementRoles, d.role, d.rolePrecision)}${d.environnement ? ' · ' + labelOf(environnements, d.environnement) : ''}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = (a.responsabilites ?? []).map((r: any) => `${nameOf(refs.personnes, r.personneId)} · ${labelOf(responsabiliteRoles, r.role)}`)
  return {
    title: a.nom,
    subtitle: a.description || undefined,
    pills: [
      { text: labelOfAutre(appCategories, a.categorie, a.categoriePrecision), tone: 'primary' },
      { text: labelOf(appStatuts, a.statut), tone: appStatutTone(a.statut) },
      ...(a.criticite ? [{ text: labelOf(appCriticites, a.criticite), tone: appCriticiteTone(a.criticite) }] : []),
      ...(a.exposition ? [{ text: labelOf(appExpositions, a.exposition), tone: appExpositionTone(a.exposition) }] : []),
      ...(a.donneesPersonnelles ? [{ text: 'RGPD', tone: 'purple' }] : []),
    ],
    sections: [
      { title: 'Identité', rows: [
        { label: 'Catégorie', value: labelOfAutre(appCategories, a.categorie, a.categoriePrecision) },
        { label: 'Statut', value: labelOf(appStatuts, a.statut) },
        { label: 'Criticité', value: a.criticite ? labelOf(appCriticites, a.criticite) : '—' },
        { label: 'URL de l\'application', value: a.url || '—' },
        { label: 'Site web du produit', value: a.siteWeb || '—' },
        ...(a.depotUrl ? [{ label: 'Dépôt Git / code source', value: a.depotUrl }] : []),
      ] },
      { title: 'Sécurité & données', rows: [
        { label: 'Sensibilité des données', value: a.sensibilite ? labelOf(appSensibilites, a.sensibilite) : '—' },
        { label: 'Exposition', value: a.exposition ? labelOf(appExpositions, a.exposition) : '—' },
        { label: 'Données personnelles (RGPD)', value: yn(a.donneesPersonnelles) },
      ] },
      { title: 'Authentification', lines: auth.length ? auth : undefined },
      { title: 'Technique & cycle de vie', rows: [
        { label: 'Hébergement', value: a.hebergement ? labelOf(appHebergements, a.hebergement) : '—' },
        { label: 'Mise à jour', value: a.maintenueAJour ? labelOf(appMaintenances, a.maintenueAJour) : '—' },
        { label: 'Open source', value: yn(a.openSource) },
        { label: 'Développement interne', value: yn(a.devInterne) },
        { label: 'Mise en service', value: a.dateMiseEnService || '—' },
        { label: 'Fin de support', value: a.dateFinDeSupport || '—' },
      ] },
      { title: 'Homologation', rows: [
        { label: 'Homologuée', value: yn(a.homologuee) },
        { label: 'Date d\'homologation', value: a.dateHomologation || '—' },
        { label: 'Prochaine revue', value: a.dateRevueHomologation || '—' },
      ] },
      { title: 'Rattachements', rows: [
        { label: 'Éditeur', value: nameOf(refs.tiers, a.editeurId) },
        { label: 'Pôle pilote', value: nameOf(refs.poles, a.poleId) },
        { label: 'Responsable principal', value: nameOf(refs.personnes, a.responsableId) },
        { label: 'Responsable (organisation)', value: orgaName(a) ?? '—' },
      ] },
      { title: 'Serveurs & déploiements', lines: dep.length ? dep : undefined },
      { title: 'Responsables', lines: resp.length ? resp : undefined },
      { title: 'Liens', rows: [
        { label: 'Technologies', value: namesOf(refs.technologies, a.technologieIds).join(', ') || '—' },
        { label: 'Prestataires', value: namesOf(refs.tiers, a.prestataireIds).join(', ') || '—' },
        { label: 'Populations concernées', value: namesOf(refs.populations, a.populationIds).join(', ') || '—' },
        { label: 'Groupes concernés', value: namesOf(refs.groupes, a.groupeIds).join(', ') || '—' },
      ] },
    ],
  }
})

const remove = async () => {
  if (!confirm('Supprimer cette application ?')) return
  const { data } = await eden.api.applications({ id }).delete()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((data as any)?.queued) alert('Votre demande de suppression a été envoyée pour validation.')
  await refreshNuxtData('applications')
  await navigateTo('/applications')
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <div
      v-if="!app"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Application introuvable.
    </div>
    <template v-else>
      <div class="flex items-center gap-2 text-sm text-secondary-500">
        <NuxtLink
          href="/applications"
          class="hover:text-secondary-800"
        >Applications</NuxtLink>
        <Icon
          name="lucide:chevron-right"
          class="size-4"
        />
        <span class="text-secondary-700">{{ app.nom }}</span>
      </div>

      <!-- Bandeau -->
      <div class="relative rounded-2xl border border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40 p-6 shadow-sm">
        <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div class="absolute -right-12 -top-16 size-52 rounded-full bg-primary-300/20 blur-3xl" />
        </div>
        <div class="relative flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-2xl font-semibold tracking-tight text-secondary-900">
                {{ app.nom }}
              </h1>
              <Pill tone="primary">
                {{ labelOfAutre(appCategories, app.categorie, app.categoriePrecision) }}
              </Pill>
            </div>
            <p
              v-if="app.description"
              class="mt-1.5 max-w-2xl text-sm text-secondary-600"
            >
              {{ app.description }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <Pill :tone="appStatutTone(app.statut)">
                {{ labelOf(appStatuts, app.statut) }}
              </Pill>
              <Pill
                v-if="app.criticite"
                :tone="appCriticiteTone(app.criticite)"
              >
                {{ labelOf(appCriticites, app.criticite) }}
              </Pill>
              <Pill
                v-if="app.exposition"
                :tone="appExpositionTone(app.exposition)"
              >
                {{ labelOf(appExpositions, app.exposition) }}
              </Pill>
              <Pill
                v-if="app.donneesPersonnelles"
                tone="purple"
              >
                RGPD
              </Pill>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <FicheExportMenu :doc="exportDoc" />
            <template v-if="proposable">
              <UIButton
                variant="outline"
                size="md"
                class="group font-mono shadow-sm transition-all duration-300 hover:shadow-md"
                @click="navigateTo(`/applications/${id}/edit`)"
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
        class="grid grid-cols-1 gap-5 lg:grid-cols-2"
      >
        <DetailSection
          title="Identité"
          icon="lucide:info"
        >
          <DetailField
            label="Catégorie"
            :value="labelOfAutre(appCategories, app.categorie, app.categoriePrecision)"
          />
          <DetailField
            label="Statut"
            :value="labelOf(appStatuts, app.statut)"
          />
          <DetailField
            label="Criticité"
            :value="app.criticite ? labelOf(appCriticites, app.criticite) : null"
          />
          <DetailField label="URL de l'application">
            <a
              v-if="isHttp(app.url)"
              :href="app.url"
              target="_blank"
              rel="noopener"
              class="text-primary-600 hover:underline"
            >{{ app.url }}</a>
            <span v-else-if="app.url">{{ app.url }}</span>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
          <DetailField label="Site web du produit">
            <a
              v-if="isHttp(app.siteWeb)"
              :href="app.siteWeb"
              target="_blank"
              rel="noopener"
              class="text-primary-600 hover:underline"
            >{{ app.siteWeb }}</a>
            <span v-else-if="app.siteWeb">{{ app.siteWeb }}</span>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
          <DetailField
            v-if="app.depotUrl"
            label="Dépôt Git / code source"
          >
            <a
              v-if="isHttp(app.depotUrl)"
              :href="app.depotUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-primary-600 hover:underline"
            >
              <Icon
                name="lucide:git-branch"
                class="size-3.5"
              /> {{ app.depotUrl }}
            </a>
            <span v-else>{{ app.depotUrl }}</span>
          </DetailField>
        </DetailSection>

        <DetailSection
          title="Sécurité & données"
          icon="lucide:shield"
        >
          <DetailField
            label="Sensibilité des données"
            :value="app.sensibilite ? labelOf(appSensibilites, app.sensibilite) : null"
          />
          <DetailField
            label="Exposition"
            :value="app.exposition ? labelOf(appExpositions, app.exposition) : null"
          />
          <DetailField
            label="Données personnelles (RGPD)"
            :value="app.donneesPersonnelles ? 'Oui' : 'Non'"
          />
        </DetailSection>

        <DetailSection
          title="Authentification"
          icon="lucide:key-round"
        >
          <DetailField
            label="Méthodes"
            wide
          >
            <div
              v-if="app.authentification?.length"
              class="flex flex-wrap gap-2"
            >
              <span
                v-for="m in app.authentification"
                :key="m"
                :class="chip"
              >
                {{ m === 'autre' && app.authentificationAutre ? `Autre : ${app.authentificationAutre}` : labelOf(authMethodes, m) }}
              </span>
            </div>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
        </DetailSection>

        <DetailSection
          title="Technique & cycle de vie"
          icon="lucide:settings-2"
        >
          <DetailField
            label="Hébergement"
            :value="app.hebergement ? labelOf(appHebergements, app.hebergement) : null"
          />
          <DetailField
            label="Mise à jour"
            :value="app.maintenueAJour ? labelOf(appMaintenances, app.maintenueAJour) : null"
          />
          <DetailField
            label="Open source"
            :value="app.openSource ? 'Oui' : 'Non'"
          />
          <DetailField
            label="Développement interne"
            :value="app.devInterne ? 'Oui' : 'Non'"
          />
          <DetailField
            label="Mise en service"
            :value="app.dateMiseEnService"
          />
          <DetailField
            label="Fin de support"
            :value="app.dateFinDeSupport"
          />
        </DetailSection>

        <DetailSection
          title="Homologation"
          icon="lucide:badge-check"
        >
          <DetailField
            label="Homologuée"
            :value="app.homologuee ? 'Oui' : 'Non'"
          />
          <DetailField
            label="Date d'homologation"
            :value="app.dateHomologation"
          />
          <DetailField
            label="Prochaine revue"
            :value="app.dateRevueHomologation"
          />
        </DetailSection>

        <DetailSection
          title="Rattachements"
          icon="lucide:link"
        >
          <DetailField
            label="Éditeur"
            :value="nameOf(refs.tiers, app.editeurId)"
          />
          <DetailField
            label="Pôle pilote"
            :value="nameOf(refs.poles, app.poleId)"
          />
          <DetailField
            label="Responsable principal"
            :value="nameOf(refs.personnes, app.responsableId)"
          />
          <DetailField
            label="Responsable (organisation)"
            :value="orgaName(app)"
          />
        </DetailSection>

        <DetailSection
          title="Serveurs & déploiements"
          icon="lucide:server"
          class="lg:col-span-2"
        >
          <DetailField
            label="Déploiements"
            wide
          >
            <ul
              v-if="app.deploiements?.length"
              class="space-y-1.5"
            >
              <li
                v-for="(d, i) in app.deploiements"
                :key="i"
                class="flex flex-wrap items-center gap-2 text-sm"
              >
                <span class="font-medium text-secondary-900">{{ nameOf(refs.serveurs, d.serveurId) }}</span>
                <Pill tone="primary">
                  {{ labelOfAutre(deploiementRoles, d.role, d.rolePrecision) }}
                </Pill>
                <Pill
                  v-if="d.environnement"
                  tone="blue"
                >
                  {{ labelOf(environnements, d.environnement) }}
                </Pill>
              </li>
            </ul>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
        </DetailSection>

        <DetailSection
          title="Responsables"
          icon="lucide:users"
          class="lg:col-span-2"
        >
          <DetailField
            label="Responsables"
            wide
          >
            <ul
              v-if="app.responsabilites?.length"
              class="space-y-1.5"
            >
              <li
                v-for="(r, i) in app.responsabilites"
                :key="i"
                class="flex flex-wrap items-center gap-2 text-sm"
              >
                <span class="font-medium text-secondary-900">{{ nameOf(refs.personnes, r.personneId) }}</span>
                <Pill tone="gray">
                  {{ labelOf(responsabiliteRoles, r.role) }}
                </Pill>
              </li>
            </ul>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
        </DetailSection>

        <DetailSection
          title="Liens"
          icon="lucide:layers"
          class="lg:col-span-2"
        >
          <DetailField
            label="Technologies"
            wide
          >
            <div
              v-if="namesOf(refs.technologies, app.technologieIds).length"
              class="flex flex-wrap gap-2"
            >
              <span
                v-for="n in namesOf(refs.technologies, app.technologieIds)"
                :key="n"
                :class="chip"
              >{{ n }}</span>
            </div>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
          <DetailField
            label="Prestataires"
            wide
          >
            <div
              v-if="namesOf(refs.tiers, app.prestataireIds).length"
              class="flex flex-wrap gap-2"
            >
              <span
                v-for="n in namesOf(refs.tiers, app.prestataireIds)"
                :key="n"
                :class="chip"
              >{{ n }}</span>
            </div>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
          <DetailField
            label="Populations concernées"
            wide
          >
            <div
              v-if="namesOf(refs.populations, app.populationIds).length"
              class="flex flex-wrap gap-2"
            >
              <span
                v-for="n in namesOf(refs.populations, app.populationIds)"
                :key="n"
                :class="chip"
              >{{ n }}</span>
            </div>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
          <DetailField
            label="Groupes concernés"
            wide
          >
            <div
              v-if="namesOf(refs.groupes, app.groupeIds).length"
              class="flex flex-wrap gap-2"
            >
              <span
                v-for="n in namesOf(refs.groupes, app.groupeIds)"
                :key="n"
                :class="chip"
              >{{ n }}</span>
            </div>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
        </DetailSection>
      </div>

      <!-- Volet RGPD : n'apparaît que si l'application traite des données personnelles. -->
      <div
        v-show="tab === 'details'"
        class="mt-5"
      >
        <DetailSection
          v-if="app?.donneesPersonnelles"
          title="RGPD — sécurité du traitement"
          icon="lucide:shield-check"
        >
          <ApplicationRgpd :application-id="String(app.id)" />
        </DetailSection>
      </div>

      <!-- Sites et services exposés rattachés à l'application : ce qu'elle présente à Internet. -->
      <div
        v-if="servicesApp"
        v-show="tab === 'details'"
        class="mt-5"
      >
        <DetailSection
          title="Sites et services exposés"
          icon="lucide:globe"
        >
          <p
            v-if="!servicesApp.resultats.length"
            class="text-sm text-secondary-500"
          >
            Aucun service exposé n'est rattaché à cette application.
          </p>
          <ul
            v-else
            class="divide-y divide-secondary-100"
          >
            <li
              v-for="sv in servicesApp.resultats"
              :key="sv.id"
              class="flex flex-wrap items-center gap-2 py-2 text-sm"
            >
              <NuxtLink
                :to="`/sites-services/${sv.id}`"
                class="font-medium text-primary-700 hover:underline"
              >
                {{ sv.hote }}<span v-if="sv.port !== 443">:{{ sv.port }}</span>
              </NuxtLink>
              <span
                v-if="sv.libelle"
                class="text-secondary-500"
              >{{ sv.libelle }}</span>
              <Pill
                v-if="sv.classement"
                tone="purple"
              >
                {{ sv.classement }}
              </Pill>
              <Pill
                v-if="sv.signalements.length"
                tone="amber"
              >
                {{ sv.signalements.length }} point(s) d'exposition à traiter
              </Pill>
            </li>
          </ul>
        </DetailSection>
      </div>

      <!-- Onglet Chronologie -->
      <div v-show="tab === 'history'">
        <DetailSection
          title="Chronologie des modifications"
          icon="lucide:history"
        >
          <ChangeTimeline
            entite="applications"
            :history="history"
          />
        </DetailSection>
      </div>
    </template>
  </div>
</template>
