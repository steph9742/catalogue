<script setup lang="ts">
import { UIButton, UITabs, UITabsItem } from '@catalogue/ui'
import DetailSection from '~/components/detail/DetailSection.vue'
import DetailField from '~/components/detail/DetailField.vue'
import ChangeTimeline from '~/components/detail/ChangeTimeline.vue'
import FicheExportMenu from '~/components/detail/FicheExportMenu.vue'
import Pill from '~/components/ui/Pill.vue'
import type { FicheDoc } from '~/utils/ficheExport'
import { labelOf, tiersTypes, tiersNiveauAcces } from '~/utils/catalogueEnums'

const route = useRoute()
const api = useApi()
const id = route.params.id as string

const { data: tiers } = await useAsyncData(`tiers-${id}`, () =>
  api<Record<string, unknown>>(`/api/tiers/${id}`),
{ getCachedData: () => undefined })
const { data: personnesRows } = await useAsyncData('opts-personnes', () => api<Record<string, unknown>[]>('/api/personnes'), { getCachedData: () => undefined })

const perms = await usePermissions()
const proposable = computed(() => perms.canPropose('tiers'))
const tab = ref('details')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { data: history } = await useAsyncData(`audit-tiers-${id}`, () => api<any[]>(`/api/audit/tiers/${id}`), { getCachedData: () => undefined })
// LE NOM DE LA FICHE DANS L'ONGLET. Sans lui, douze onglets ouverts s'appellent tous
// « Prestataires » : le titre dérivé du menu nomme le catalogue, pas l'enregistrement.
useHead({ title: () => (typeof tiers.value?.nom === 'string' ? tiers.value.nom : undefined) })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = computed(() => tiers.value as any)
const typeTone = (v: string) => ({ editeur: 'blue', prestataire_it: 'primary', prestataire_non_it: 'purple' }[v] ?? 'gray')
const accesTone = (v: string) => ({ permanent: 'amber', ponctuel: 'blue', aucun: 'gray' }[v] ?? 'gray')
const personneName = (pid: string) => {
  const p = (personnesRows.value ?? []).find(x => String(x.id) === pid)
  return p ? `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim() : pid
}

const exportDoc = computed<FicheDoc>(() => {
  const it = t.value
  if (!it) return { title: '—', sections: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contacts = (it.contacts ?? []).map((c: any) => `${c.nom}${c.principal ? ' (principal)' : ''}${c.fonction ? ' · ' + c.fonction : ''}${c.email ? ' · ' + c.email : ''}${c.telephone ? ' · ' + c.telephone : ''}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referents = (it.referents ?? []).map((r: any) => `${personneName(r.personneId)}${r.principal ? ' (principal)' : ''}${r.role ? ' · ' + r.role : ''}`)
  return {
    title: it.nom,
    subtitle: it.activite || undefined,
    pills: [
      { text: labelOf(tiersTypes, it.type), tone: typeTone(it.type) },
      ...(it.niveauAcces ? [{ text: 'Accès ' + labelOf(tiersNiveauAcces, it.niveauAcces).toLowerCase(), tone: accesTone(it.niveauAcces) }] : []),
    ],
    sections: [
      { title: 'Tiers', rows: [
        { label: 'Type', value: labelOf(tiersTypes, it.type) },
        { label: 'Activité', value: it.activite || '—' },
        { label: 'Niveau d\'accès', value: it.niveauAcces ? labelOf(tiersNiveauAcces, it.niveauAcces) : '—' },
        { label: 'Référence marché / contrat', value: it.contratRef || '—' },
        { label: 'Fin de contrat', value: it.contratFin || '—' },
        { label: 'Notes sécurité', value: it.notesSecurite || '—' },
      ] },
      { title: 'Contacts prestataire', lines: contacts.length ? contacts : undefined },
      { title: 'Référents internes', lines: referents.length ? referents : undefined },
    ],
  }
})

const remove = async () => {
  if (!confirm('Supprimer ce tiers ?')) return
  const res = await api<{ queued?: boolean }>(`/api/tiers/${id}`, { method: 'DELETE' })
  if (res?.queued) alert('Votre demande de suppression a été envoyée pour validation.')
  await refreshNuxtData('cat-tiers')
  await navigateTo('/tiers')
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <div
      v-if="!t"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-secondary-500"
    >
      Tiers introuvable.
    </div>
    <template v-else>
      <div class="flex items-center gap-2 text-sm text-secondary-500">
        <NuxtLink
          href="/tiers"
          class="hover:text-secondary-800"
        >Prestataires</NuxtLink>
        <Icon
          name="lucide:chevron-right"
          class="size-4"
        />
        <span class="text-secondary-700">{{ t.nom }}</span>
      </div>

      <div class="relative rounded-2xl border border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40 p-6 shadow-sm">
        <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div class="absolute -right-12 -top-16 size-52 rounded-full bg-primary-300/20 blur-3xl" />
        </div>
        <div class="relative flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-2xl font-semibold tracking-tight text-secondary-900">
                {{ t.nom }}
              </h1>
              <Pill :tone="typeTone(t.type)">
                {{ labelOf(tiersTypes, t.type) }}
              </Pill>
            </div>
            <p
              v-if="t.activite"
              class="mt-1.5 text-sm text-secondary-600"
            >
              {{ t.activite }}
            </p>
            <div
              v-if="t.niveauAcces"
              class="mt-3 flex flex-wrap gap-2"
            >
              <Pill :tone="accesTone(t.niveauAcces)">
                Accès {{ labelOf(tiersNiveauAcces, t.niveauAcces).toLowerCase() }}
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
                @click="navigateTo(`/tiers/${id}/edit`)"
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

      <div
        v-show="tab === 'details'"
        class="grid grid-cols-1 gap-5 lg:grid-cols-2"
      >
        <DetailSection
          title="Tiers"
          icon="lucide:building-2"
        >
          <DetailField
            label="Type"
            :value="labelOf(tiersTypes, t.type)"
          />
          <DetailField
            label="Activité"
            :value="t.activite"
          />
          <DetailField
            label="Niveau d'accès"
            :value="t.niveauAcces ? labelOf(tiersNiveauAcces, t.niveauAcces) : null"
          />
          <DetailField
            label="Référence marché / contrat"
            :value="t.contratRef"
          />
          <DetailField
            label="Fin de contrat"
            :value="t.contratFin"
          />
          <DetailField
            label="Notes sécurité"
            wide
            :value="t.notesSecurite"
          />
        </DetailSection>

        <DetailSection
          title="Contacts prestataire"
          icon="lucide:contact"
        >
          <DetailField
            label="Contacts"
            wide
          >
            <ul
              v-if="t.contacts?.length"
              class="space-y-2"
            >
              <li
                v-for="(c, i) in t.contacts"
                :key="i"
                class="text-sm"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-secondary-900">{{ c.nom }}</span>
                  <Pill
                    v-if="c.principal"
                    tone="primary"
                  >
                    Principal
                  </Pill>
                  <span
                    v-if="c.fonction"
                    class="text-secondary-500"
                  >· {{ c.fonction }}</span>
                </div>
                <div class="mt-0.5 font-mono text-xs text-secondary-500">
                  <span v-if="c.email">{{ c.email }}</span><span v-if="c.email && c.telephone"> · </span><span v-if="c.telephone">{{ c.telephone }}</span>
                </div>
              </li>
            </ul>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
        </DetailSection>

        <DetailSection
          title="Référents internes"
          icon="lucide:user-check"
          class="lg:col-span-2"
        >
          <DetailField
            label="Référents"
            wide
          >
            <ul
              v-if="t.referents?.length"
              class="space-y-1.5"
            >
              <li
                v-for="(r, i) in t.referents"
                :key="i"
                class="flex flex-wrap items-center gap-2 text-sm"
              >
                <span class="font-medium text-secondary-900">{{ personneName(r.personneId) }}</span>
                <Pill
                  v-if="r.principal"
                  tone="primary"
                >
                  Principal
                </Pill>
                <span
                  v-if="r.role"
                  class="text-secondary-500"
                >· {{ r.role }}</span>
              </li>
            </ul>
            <span
              v-else
              class="text-secondary-300"
            >—</span>
          </DetailField>
        </DetailSection>
      </div>

      <div v-show="tab === 'history'">
        <DetailSection
          title="Chronologie des modifications"
          icon="lucide:history"
        >
          <ChangeTimeline
            entite="tiers"
            :history="history"
          />
        </DetailSection>
      </div>
    </template>
  </div>
</template>
