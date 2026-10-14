<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
// MOTEUR D'AUDIT EXTERNE — adresse, jeton, périmètre autorisé. Le Catalogue appelle le moteur ;
// le moteur n'a aucun accès au Catalogue.

const api = useApi()
const perms = await usePermissions()
if (!perms.isAdmin.value) throw createError({ statusCode: 403, statusMessage: 'Réservé aux administrateurs' })

type Config = {
  url: string | null
  actif: boolean
  dialecte: 'contrat' | 'artemis'
  frequenceHeures: number
  domaines: string[] | null
  plages: string[] | null
  curseur: string | null
  dernierSyncAt: string | null
  dernierStatut: string
  dernierMessage: string | null
  jetonDefini: boolean
}
type Apercu = { domaines: string[], plages: string[], actifs: number }

const { data: config, refresh: rafraichirConfig } = await useAsyncData('audit-config', () => api<Config>('/api/audit-surface/config'), { getCachedData: () => undefined })
const { data: apercu, refresh: rafraichirApercu } = await useAsyncData('audit-perimetre', () => api<Apercu>('/api/audit-surface/perimetre'), { getCachedData: () => undefined })

const f = reactive({ url: '', jeton: '', actif: false, dialecte: 'contrat' as 'contrat' | 'artemis', frequenceHeures: 24, domaines: '', plages: '' })
watchEffect(() => {
  if (!config.value) return
  f.url = config.value.url ?? ''
  f.actif = config.value.actif
  f.dialecte = config.value.dialecte ?? 'contrat'
  f.frequenceHeures = config.value.frequenceHeures
  f.domaines = (config.value.domaines ?? []).join('\n')
  f.plages = (config.value.plages ?? []).join('\n')
})

const msg = ref('')
const msgTon = ref<'ok' | 'err' | ''>('')
const busy = ref('')
const lignes = (s: string) => s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean)

type Retour = { ok?: boolean, message?: string } | null | undefined
const agir = async (quoi: string, fn: () => Promise<Retour>) => {
  busy.value = quoi
  msg.value = ''
  try {
    const r = await fn()
    msg.value = (r && r.message) || 'Fait.'
    msgTon.value = r && r.ok === false ? 'err' : 'ok'
    await Promise.all([rafraichirConfig(), rafraichirApercu()])
  }
  catch (e) {
    msg.value = messageErreur(e, 'Échec.')
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}

const enregistrer = () => agir('save', async () => {
  const r = await api<{ rejets: { domaines: string[], plages: string[] } }>('/api/audit-surface/config', {
    method: 'PUT',
    body: { url: f.url, jeton: f.jeton || undefined, actif: f.actif, dialecte: f.dialecte, frequenceHeures: f.frequenceHeures, domaines: lignes(f.domaines), plages: lignes(f.plages) },
  })
  f.jeton = ''
  const refus = [...r.rejets.domaines, ...r.rejets.plages]
  return refus.length
    ? { ok: false, message: `Enregistré, mais refusé(s) : ${refus.join(', ')} (domaine invalide, ou plage invalide ou privée).` }
    : { ok: true, message: 'Configuration enregistrée.' }
})
const tester = () => agir('test', () => api<Retour>('/api/audit-surface/test', { method: 'POST', body: { url: f.url, jeton: f.jeton || undefined, dialecte: f.dialecte } }))
const synchroniser = () => agir('sync', () => api<Retour>('/api/audit-surface/synchroniser', { method: 'POST' }))
// Relire tout ce que le moteur garde : nécessaire quand la lecture s'améliore, car le
// curseur, lui, ne sait pas qu'on lit mieux qu'avant.
const relire = () => agir('relire', async () => {
  const r = await api<Retour>('/api/audit-surface/relire', { method: 'POST' })
  await api<Retour>('/api/audit-surface/synchroniser', { method: 'POST' })
  return r
})

const CHAMP = 'w-full rounded-lg border border-secondary-200 px-3 py-2 text-sm'
const LIBELLE = 'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Moteur d'audit externe
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600">
        Le Catalogue envoie le périmètre autorisé et récupère les constats. Le moteur n'a aucun accès au Catalogue.
      </p>
    </header>

    <section class="space-y-4 rounded-2xl border border-secondary-200/60 bg-white p-6">
      <label class="block">
        <span :class="LIBELLE">Adresse du moteur</span>
        <input
          v-model="f.url"
          placeholder="https://audit.exemple.fr"
          :class="CHAMP"
        >
      </label>
      <label class="block">
        <span :class="LIBELLE">Jeton de service</span>
        <input
          v-model="f.jeton"
          type="password"
          autocomplete="off"
          :placeholder="config?.jetonDefini ? '•••••••• (défini — laisser vide pour ne pas changer)' : 'Jeton fourni par le moteur'"
          :class="CHAMP"
        >
      </label>
      <label class="block">
        <span :class="LIBELLE">Domaines autorisés (un par ligne)</span>
        <textarea
          v-model="f.domaines"
          rows="3"
          :class="CHAMP"
        />
      </label>
      <label class="block">
        <span :class="LIBELLE">Plages IP publiques autorisées (CIDR, une par ligne)</span>
        <textarea
          v-model="f.plages"
          rows="3"
          :class="CHAMP"
        />
        <span class="mt-1 block text-xs text-secondary-500">Les plages privées sont refusées : invisibles depuis Internet, elles feraient balayer le réseau interne pendant la phase de test sur le portail.</span>
      </label>
      <label class="block">
        <span class="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-500">À qui l'on parle</span>
        <select
          v-model="f.dialecte"
          class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 sm:w-96"
        >
          <option value="contrat">Un moteur qui porte le contrat (/perimetre, /resultats)</option>
          <option value="artemis">Artemis, directement (en attendant)</option>
        </select>
        <!-- CE QUE LE DIALECTE ARTEMIS COÛTE, dit ici plutôt que découvert à l'usage. -->
        <span
          v-if="f.dialecte === 'artemis'"
          class="mt-1 block text-xs text-secondary-500"
        >
          Artemis ne connaît qu'une liste de cibles : le classement, les pages cibles et les plages
          d'adresses ne lui sont pas transmis. Ses résultats sont traduits en constats, et un module
          que le Catalogue ne sait pas ranger est compté et nommé plutôt que classé au hasard.
          L'adresse se saisit à la racine : <code>http://hôte:5050</code>, sans <code>/api</code>.
        </span>
      </label>
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-sm">
          <input
            v-model="f.actif"
            type="checkbox"
          > Synchronisation automatique
        </label>
        <label class="flex items-center gap-2 text-sm">
          toutes les
          <input
            v-model.number="f.frequenceHeures"
            type="number"
            min="1"
            class="w-20 rounded-lg border border-secondary-200 px-2 py-1 text-sm"
          > heures
        </label>
      </div>
      <div class="flex flex-wrap gap-2">
        <UIButton
          :disabled="!!busy"
          @click="enregistrer"
        >
          Enregistrer
        </UIButton>
        <UIButton
          variant="secondary"
          :disabled="!!busy"
          @click="tester"
        >
          Tester la connexion
        </UIButton>
        <UIButton
          variant="secondary"
          :disabled="!!busy || !config?.jetonDefini"
          @click="synchroniser"
        >
          {{ busy === 'sync' ? 'Synchronisation…' : 'Synchroniser maintenant' }}
        </UIButton>
        <UIButton
          variant="secondary"
          :disabled="!!busy || !config?.jetonDefini"
          title="Remet le curseur à zéro, puis synchronise : tout ce que le moteur garde est relu. Les constats déjà connus ne sont pas dupliqués."
          @click="relire"
        >
          {{ busy === 'relire' ? 'Relecture…' : 'Tout relire' }}
        </UIButton>
      </div>
      <p
        v-if="msg"
        class="text-sm"
        :class="msgTon === 'err' ? 'text-red-700' : 'text-emerald-700'"
      >
        {{ msg }}
      </p>
    </section>

    <section
      v-if="apercu"
      class="space-y-2 rounded-2xl border border-secondary-200/60 bg-white p-6 text-sm"
    >
      <h2 class="font-medium text-secondary-900">
        Ce qui part au moteur
      </h2>
      <p class="text-secondary-700">
        {{ apercu.domaines.length }} domaine(s), {{ apercu.plages.length }} plage(s), {{ apercu.actifs }} actif(s) surveillé(s) de l'inventaire.
      </p>
      <p class="text-xs text-secondary-500">
        Le classement paiement / sensible des actifs n'est pas encore envoyé : il part à « non classé » tant que la fiche du service ne le porte pas.
      </p>
    </section>

    <section
      v-if="config"
      class="space-y-1 rounded-2xl border border-secondary-200/60 bg-white p-6 text-sm"
    >
      <h2 class="font-medium text-secondary-900">
        Dernière synchronisation
      </h2>
      <p>
        <Pill :tone="config.dernierStatut === 'ok' ? 'emerald' : config.dernierStatut === 'erreur' ? 'red' : 'gray'">
          {{ config.dernierStatut }}
        </Pill>
        <span class="ml-2 text-secondary-600">{{ config.dernierSyncAt ? new Date(config.dernierSyncAt).toLocaleString('fr-FR') : 'jamais' }}</span>
      </p>
      <p
        v-if="config.dernierMessage"
        class="text-secondary-700"
      >
        {{ config.dernierMessage }}
      </p>
      <p class="text-xs text-secondary-500">
        Constats demandés depuis : {{ config.curseur ? new Date(config.curseur).toLocaleString('fr-FR') : 'le début' }}
      </p>
    </section>
  </div>
</template>
