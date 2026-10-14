<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
// TABLEAU DE BORD DE L'AUDIT DE SURFACE — qui a quoi à traiter, et ce qui a bougé.

type LigneMatrice = { libelle: string, parGravite: Record<string, number>, total: number }
type Tableau = {
  ouverts: number
  parComposante: LigneMatrice[]
  parProprietaire: LigneMatrice[]
  parClassement: LigneMatrice[]
  verificationInterieure: { services: number, verifies: number, sensibles: number, sensiblesVerifies: number }
}
type LigneRapport = {
  groupe: string
  hote: string
  port: number | null
  classement: string | null
  gravite: string
  categorie: string
  titre: string
  statut: string
  premierReleveLe: string
  dernierReleveLe: string
  acceptationEcheance: string | null
  sniffIncidentId: string | null
  verificationInterieureLe: string | null
}
type ChangementParc = ChangementReleve & { serviceId: string, hote: string | null, port: number | null, libelle: string | null, releveLe: string }

const api = useApi()
const { data: tableau } = await useAsyncData(
  'audit-tableau', () => api<Tableau>('/api/audit-surface/tableau').catch(() => null), { getCachedData: () => undefined },
)
const { data: semaine } = await useAsyncData(
  'audit-semaine',
  () => api<{ servicesReleves: number, changements: ChangementParc[] }>('/api/sites-services/evolution', { query: { jours: 7 } }).catch(() => null),
  { getCachedData: () => undefined },
)

const AXES = { parComposante: 'Par composante', parProprietaire: 'Par propriétaire', parClassement: 'Par classement' } as const
const axe = ref<keyof typeof AXES>('parComposante')
const GRAVITES = [
  { k: 'critique', l: 'Critique' }, { k: 'elevee', l: 'Élevée' }, { k: 'moyenne', l: 'Moyenne' }, { k: 'faible', l: 'Faible' }, { k: 'info', l: 'Info' },
]
const CLASSEMENT: Record<string, string> = { paiement: 'Paiement', sensible: 'Sensible', standard: 'Standard' }
const STATUT: Record<string, string> = { ouvert: 'Ouvert', accepte: 'Risque accepté', corrige: 'Déclaré corrigé', reteste: 'Correction vérifiée' }
const libelleAxe = (l: string) => (axe.value === 'parClassement' ? CLASSEMENT[l] ?? l : l)

// LA SEMAINE, par service : sept jours de changements, regroupés sous l'hôte qu'ils concernent.
const parService = computed(() => {
  const m = new Map<string, { hote: string, changements: ChangementParc[] }>()
  for (const c of semaine.value?.changements ?? []) {
    const hote = `${c.libelle ?? c.hote ?? '?'}${c.port && c.port !== 443 ? `:${c.port}` : ''}`
    const e = m.get(c.serviceId) ?? { hote, changements: [] }
    e.changements.push(c)
    m.set(c.serviceId, e)
  }
  return [...m.entries()].map(([serviceId, v]) => ({ serviceId, ...v }))
})

const par = ref<'composante' | 'proprietaire'>('composante')
const busy = ref(false)
const msg = ref('')
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR') : '')

const exporter = async (format: 'csv' | 'ods') => {
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{ lignes: LigneRapport[] }>('/api/audit-surface/rapport', { query: { par: par.value } })
    await exportTable(r.lignes, [
      { header: par.value === 'composante' ? 'Composante' : 'Propriétaire', value: l => l.groupe },
      { header: 'Hôte', value: l => `${l.hote}${l.port && l.port !== 443 ? `:${l.port}` : ''}` },
      { header: 'Classement', value: l => (l.classement ? CLASSEMENT[l.classement] ?? l.classement : 'non classé') },
      // « Non » n'est pas « sain » : la colonne dit si l'on SAIT, pas si c'est propre.
      { header: 'Vérifié de l\'intérieur', value: l => (l.verificationInterieureLe ? `oui, le ${date(l.verificationInterieureLe)}` : 'non') },
      { header: 'Gravité', value: l => l.gravite },
      { header: 'Catégorie', value: l => l.categorie },
      { header: 'Constat', value: l => l.titre },
      { header: 'Statut', value: l => STATUT[l.statut] ?? l.statut },
      { header: 'Vu depuis le', value: l => date(l.premierReleveLe) },
      { header: 'Dernière observation', value: l => date(l.dernierReleveLe) },
      { header: 'Risque accepté jusqu\'au', value: l => l.acceptationEcheance ?? '' },
      { header: 'Incident Sniff', value: l => l.sniffIncidentId ?? '' },
    ], `audit-surface-par-${par.value}-${new Date().toISOString().slice(0, 10)}`, format)
    msg.value = `${r.lignes.length} constat(s) exporté(s).`
  }
  catch (e) { msg.value = messageErreur(e, 'L\'export a échoué.') }
  finally { busy.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Tableau de bord de l'audit de surface
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600">
          Constats ouverts par interlocuteur, rapport à transmettre, et ce qui a changé sur les sites cette semaine.
        </p>
      </div>
      <NuxtLink
        to="/audit-surface"
        class="text-sm text-primary-700 hover:underline"
      >
        Constats et découvertes
      </NuxtLink>
    </header>

    <section
      v-if="tableau"
      class="grid gap-3 sm:grid-cols-3"
    >
      <div class="rounded-xl border border-secondary-200/60 bg-white px-4 py-3">
        <span class="block text-2xl font-semibold tabular-nums text-secondary-900">{{ tableau.ouverts }}</span>
        <span class="text-xs text-secondary-600">constat(s) ouvert(s), hors découvertes</span>
      </div>
      <div class="rounded-xl border border-secondary-200/60 bg-white px-4 py-3">
        <span class="block text-2xl font-semibold tabular-nums text-secondary-900">
          {{ tableau.verificationInterieure.sensiblesVerifies }}<span class="text-base font-normal text-secondary-500"> / {{ tableau.verificationInterieure.sensibles }}</span>
        </span>
        <span class="text-xs text-secondary-600">service(s) sensible(s) ou de paiement vérifié(s) de l'intérieur</span>
      </div>
      <p class="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800">
        Un site sans constat vu de l'extérieur n'est pas un site sain : une porte dérobée dans un fichier du CMS ne se voit
        que de l'intérieur du serveur.
      </p>
    </section>

    <section
      v-if="tableau"
      class="space-y-3 rounded-2xl border border-secondary-200/60 bg-white p-5"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="mr-2 text-sm font-semibold text-secondary-900">
          Constats ouverts
        </h2>
        <UIButton
          v-for="(l, k) in AXES"
          :key="k"
          :variant="axe === k ? 'primary' : 'secondary'"
          @click="axe = k"
        >
          {{ l }}
        </UIButton>
      </div>
      <p
        v-if="!tableau[axe].length"
        class="text-sm text-secondary-500"
      >
        Aucun constat ouvert.
      </p>
      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] text-secondary-500">
              <th class="py-1 pr-3 font-medium">
                {{ AXES[axe].replace('Par ', '').replace(/^./, x => x.toUpperCase()) }}
              </th>
              <th
                v-for="g in GRAVITES"
                :key="g.k"
                class="py-1 pr-3 text-right font-medium"
              >
                {{ g.l }}
              </th>
              <th class="py-1 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="l in tableau[axe]"
              :key="l.libelle"
              class="border-t border-secondary-100"
            >
              <td
                class="py-1.5 pr-3"
                :class="l.libelle.startsWith('(') ? 'italic text-secondary-500' : 'text-secondary-800'"
              >
                {{ libelleAxe(l.libelle) }}
              </td>
              <td
                v-for="g in GRAVITES"
                :key="g.k"
                class="py-1.5 pr-3 text-right tabular-nums"
                :class="l.parGravite[g.k] && (g.k === 'critique' || g.k === 'elevee') ? 'font-semibold text-red-600' : 'text-secondary-600'"
              >
                {{ l.parGravite[g.k] || '·' }}
              </td>
              <td class="py-1.5 text-right font-medium tabular-nums text-secondary-900">
                {{ l.total }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="space-y-3 rounded-2xl border border-secondary-200/60 bg-white p-5">
      <h2 class="text-sm font-semibold text-secondary-900">
        Rapport à transmettre
      </h2>
      <p class="text-xs text-secondary-500">
        Constats ouverts, risques acceptés et corrections déclarées, regroupés par composante ou par propriétaire. La colonne
        « vérifié de l'intérieur » dit si l'on sait, pas si le site est propre.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="par"
          class="rounded-lg border border-secondary-200 px-2 py-2 text-sm"
        >
          <option value="composante">
            Par composante
          </option>
          <option value="proprietaire">
            Par propriétaire
          </option>
        </select>
        <UIButton
          :disabled="busy"
          @click="exporter('ods')"
        >
          Exporter en ODS
        </UIButton>
        <UIButton
          variant="secondary"
          :disabled="busy"
          @click="exporter('csv')"
        >
          Exporter en CSV
        </UIButton>
        <span
          v-if="msg"
          class="text-sm text-secondary-700"
        >{{ msg }}</span>
      </div>
    </section>

    <section class="space-y-3 rounded-2xl border border-secondary-200/60 bg-white p-5">
      <h2 class="text-sm font-semibold text-secondary-900">
        Ce qui a changé cette semaine
      </h2>
      <p class="text-xs text-secondary-500">
        Sept derniers jours de relevés, chaque service comparé à son dernier relevé antérieur.
        {{ semaine?.servicesReleves ?? 0 }} service(s) relevé(s) sur la période : un service non relevé n'a pas pu changer, ce qui ne veut pas dire qu'il est stable.
      </p>
      <p
        v-if="!parService.length"
        class="text-sm text-secondary-500"
      >
        Aucun changement relevé sur la période.
      </p>
      <div
        v-for="sv in parService"
        :key="sv.serviceId"
        class="flex flex-wrap items-baseline gap-2 border-t border-secondary-100 py-2 text-sm"
      >
        <NuxtLink
          :to="`/sites-services/${sv.serviceId}`"
          class="min-w-48 font-medium text-primary-700 hover:underline"
        >
          {{ sv.hote }}
        </NuxtLink>
        <Pill
          v-for="(c, i) in sv.changements"
          :key="i"
          :tone="decrireChangement(c).ton"
        >
          {{ decrireChangement(c).texte }}
        </Pill>
      </div>
    </section>
  </div>
</template>
