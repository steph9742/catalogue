<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
// DOMAINES SURVEILLÉS — trouver les sites de l'établissement. Deux sources.

type Domaine = {
  id: string
  nom: string
  actif: boolean
  serveurDns: string | null
  tsigNom: string | null
  tsigAlgorithme: string | null
  tsigSecretDefini: boolean
  dernierReleveLe: string | null
  dernierStatut: string
  dernierMessage: string | null
}

const api = useApi()
const perms = await usePermissions()
const modifiable = computed(() => perms.canPropose('audit-surface'))
const admin = computed(() => perms.isAdmin.value)

const { data: domaines, refresh } = await useAsyncData(
  'domaines-surveilles', () => api<Domaine[]>('/api/domaines-surveilles'), { getCachedData: () => undefined },
)

const saisie = ref('')
const msg = ref('')
const busy = ref(false)
let minuteur: ReturnType<typeof setTimeout> | null = null

// UN RELEVÉ TOURNE CÔTÉ SERVEUR : la page se rafraîchit tant qu'un domaine est « en cours ».
const suivre = () => {
  if (minuteur) clearTimeout(minuteur)
  minuteur = setTimeout(async () => {
    await refresh()
    if (domaines.value?.some(d => d.dernierStatut === 'en_cours')) suivre()
  }, 3000)
}
onMounted(() => {
  if (domaines.value?.some(d => d.dernierStatut === 'en_cours')) suivre()
})
onBeforeUnmount(() => {
  if (minuteur) clearTimeout(minuteur)
})

const ajouter = async () => {
  busy.value = true
  msg.value = ''
  try {
    const r = await api<{ ajoutes: string[], dejaPresents: string[], rejets: string[] }>('/api/domaines-surveilles', { method: 'POST', body: { noms: saisie.value } })
    msg.value = `${r.ajoutes.length} domaine(s) ajouté(s)`
      + `${r.dejaPresents.length ? `, ${r.dejaPresents.length} déjà présent(s)` : ''}`
      + `${r.rejets.length ? ` ; refusé(s), car ce ne sont pas des noms de domaine : ${r.rejets.join(', ')}` : ''}.`
    saisie.value = ''
    await refresh()
  }
  catch (e) { msg.value = messageErreur(e, 'Les domaines n\'ont pas été ajoutés.') }
  finally { busy.value = false }
}

const relever = async (d?: Domaine) => {
  msg.value = ''
  try {
    await api(d ? `/api/domaines-surveilles/${d.id}/relever` : '/api/domaines-surveilles/relever-tout', { method: 'POST' })
    msg.value = d ? `Relevé de ${d.nom} lancé.` : 'Relevé de tous les domaines lancé, un à la fois.'
    await refresh()
    suivre()
  }
  catch (e) { msg.value = messageErreur(e, 'Le relevé n\'a pas pu être lancé.') }
}

const retirer = async (d: Domaine) => {
  if (!confirm(`Retirer ${d.nom} des domaines surveillés ?\n\nLes découvertes déjà faites restent dans la file.`)) return
  try {
    await api(`/api/domaines-surveilles/${d.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) { msg.value = messageErreur(e, 'Le domaine n\'a pas été retiré.') }
}

// --- Zone DNS : transfert et import ---------------------------------------------------------
const ouvert = ref<string | null>(null)
const ALGORITHMES = ['hmac-sha256', 'hmac-sha512', 'hmac-sha384', 'hmac-sha224', 'hmac-sha1', 'hmac-md5']
const formulaires = reactive<Record<string, { serveurDns: string, tsigNom: string, tsigAlgorithme: string, tsigSecret: string, msg: string }>>({})
const formulaire = (d: Domaine) => (formulaires[d.id] ??= {
  serveurDns: d.serveurDns ?? '', tsigNom: d.tsigNom ?? '', tsigAlgorithme: d.tsigAlgorithme ?? 'hmac-sha256', tsigSecret: '', msg: '',
})

const enregistrerTransfert = async (d: Domaine) => {
  const f = formulaire(d)
  f.msg = ''
  try {
    const r = await api<{ transfert: boolean }>(`/api/domaines-surveilles/${d.id}/transfert`, {
      method: 'PUT',
      body: { serveurDns: f.serveurDns || null, tsigNom: f.tsigNom || null, tsigAlgorithme: f.tsigNom ? f.tsigAlgorithme : null, tsigSecret: f.tsigSecret || undefined },
    })
    f.tsigSecret = ''
    f.msg = r.transfert ? 'Transfert de zone enregistré : il sera tenté au prochain relevé.' : 'Transfert de zone désactivé.'
    await refresh()
  }
  catch (e) { f.msg = messageErreur(e, 'Le transfert n\'a pas été enregistré.') }
}

const importer = async (d: Domaine, evenement: Event) => {
  const f = formulaire(d)
  const fichier = (evenement.target as HTMLInputElement).files?.[0]
  if (!fichier) return
  f.msg = `Import de ${fichier.name}…`
  try {
    const r = await api<{ message: string }>(`/api/domaines-surveilles/${d.id}/zone`, { method: 'POST', body: { texte: await fichier.text() } })
    f.msg = r.message
    await refresh()
  }
  catch (e) { f.msg = messageErreur(e, 'Le fichier de zone n\'a pas été importé.') }
  finally { (evenement.target as HTMLInputElement).value = '' }
}

const STATUT: Record<string, { l: string, t: string }> = {
  jamais: { l: 'jamais relevé', t: 'gray' },
  en_cours: { l: 'relevé en cours…', t: 'blue' },
  ok: { l: 'relevé', t: 'emerald' },
  erreur: { l: 'en échec', t: 'red' },
}
const dateFr = (s: string | null) => (s ? new Date(s).toLocaleString('fr-FR') : '—')
const CHAMP = 'rounded-lg border border-secondary-200 px-2 py-1.5 text-sm'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Domaines surveillés
        </UITitle>
        <p class="mt-1 max-w-3xl text-sm text-secondary-600">
          Deux sources de sites. Certificate Transparency (crt.sh) donne les noms portés par un certificat, même expiré,
          vérifiés en DNS. La zone DNS — transférée depuis le serveur ou importée en fichier — donne tous les noms, y compris
          ceux servis par un certificat joker, qui n'apparaissent dans aucun journal public. Les noms trouvés arrivent dans
          les découvertes à valider. Relevé automatique une fois par semaine.
        </p>
      </div>
      <NuxtLink
        to="/audit-surface"
        class="text-sm text-primary-700 hover:underline"
      >
        Découvertes à valider
      </NuxtLink>
    </header>

    <section
      v-if="modifiable"
      class="space-y-3 rounded-2xl border border-secondary-200/60 bg-white p-5"
    >
      <label class="block">
        <span class="mb-1 block text-sm font-medium text-secondary-900">Ajouter des domaines</span>
        <textarea
          v-model="saisie"
          rows="4"
          placeholder="example.org&#10;exemple.fr&#10;autre-exemple.fr"
          class="w-full rounded-lg border border-secondary-200 px-3 py-2 font-mono text-sm"
        />
        <span class="mt-1 block text-xs text-secondary-500">Un par ligne, autant que nécessaire. Un sous-domaine est accepté ; « *. » est retiré.</span>
      </label>
      <div class="flex flex-wrap items-center gap-2">
        <UIButton
          :disabled="busy || !saisie.trim()"
          @click="ajouter"
        >
          Ajouter
        </UIButton>
        <UIButton
          variant="secondary"
          :disabled="!domaines?.length"
          @click="relever()"
        >
          Relever tous les domaines
        </UIButton>
      </div>
    </section>

    <p
      v-if="msg"
      class="text-sm text-secondary-700"
    >
      {{ msg }}
    </p>

    <section class="rounded-2xl border border-secondary-200/60 bg-white p-5">
      <p
        v-if="!domaines?.length"
        class="text-sm text-secondary-500"
      >
        Aucun domaine surveillé.
      </p>
      <article
        v-for="d in domaines ?? []"
        :key="d.id"
        class="space-y-3 border-t border-secondary-100 py-3 first:border-t-0"
      >
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-64 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm font-medium text-secondary-900">{{ d.nom }}</span>
              <Pill :tone="STATUT[d.dernierStatut]?.t ?? 'gray'">
                {{ STATUT[d.dernierStatut]?.l ?? d.dernierStatut }}
              </Pill>
              <Pill
                v-if="d.serveurDns"
                tone="purple"
              >
                transfert de zone @{{ d.serveurDns }}{{ d.tsigNom ? ' · TSIG' : '' }}
              </Pill>
              <span class="text-xs text-secondary-500">{{ dateFr(d.dernierReleveLe) }}</span>
            </div>
            <p
              v-if="d.dernierMessage"
              class="whitespace-pre-line text-xs"
              :class="d.dernierStatut === 'erreur' ? 'text-red-700' : 'text-secondary-600'"
            >
              {{ d.dernierMessage }}
            </p>
          </div>
          <div
            v-if="modifiable"
            class="flex flex-wrap gap-2"
          >
            <UIButton
              variant="secondary"
              :disabled="d.dernierStatut === 'en_cours'"
              @click="relever(d)"
            >
              Relever
            </UIButton>
            <UIButton
              variant="ghost"
              @click="ouvert = ouvert === d.id ? null : d.id"
            >
              Zone DNS…
            </UIButton>
            <UIButton
              variant="ghost"
              @click="retirer(d)"
            >
              Retirer
            </UIButton>
          </div>
        </div>

        <div
          v-if="ouvert === d.id"
          class="space-y-4 rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-4"
        >
          <div
            v-if="admin"
            class="space-y-2"
          >
            <p class="text-sm font-medium text-secondary-900">
              Transfert de zone (AXFR)
            </p>
            <p class="text-xs text-secondary-500">
              Le serveur DNS doit autoriser l'adresse du Catalogue (allow-transfer). Clé TSIG facultative, secret en base64,
              conservé chiffré. Laisser le serveur vide désactive le transfert.
            </p>
            <div class="flex flex-wrap items-end gap-2">
              <input
                v-model="formulaire(d).serveurDns"
                placeholder="Serveur DNS (ex. 203.0.113.53)"
                :class="[CHAMP, 'w-56 font-mono']"
              >
              <input
                v-model="formulaire(d).tsigNom"
                placeholder="Nom de la clé TSIG (facultatif)"
                :class="[CHAMP, 'w-56 font-mono']"
              >
              <select
                v-model="formulaire(d).tsigAlgorithme"
                :disabled="!formulaire(d).tsigNom"
                :class="CHAMP"
              >
                <option
                  v-for="a in ALGORITHMES"
                  :key="a"
                  :value="a"
                >
                  {{ a }}
                </option>
              </select>
              <input
                v-model="formulaire(d).tsigSecret"
                type="password"
                autocomplete="off"
                :disabled="!formulaire(d).tsigNom"
                :placeholder="d.tsigSecretDefini ? '•••••• (défini — laisser vide pour ne pas changer)' : 'Secret TSIG (base64)'"
                :class="[CHAMP, 'w-64 font-mono']"
              >
              <UIButton
                variant="secondary"
                @click="enregistrerTransfert(d)"
              >
                Enregistrer
              </UIButton>
            </div>
          </div>
          <div class="space-y-2">
            <p class="text-sm font-medium text-secondary-900">
              Importer un fichier de zone
            </p>
            <p class="text-xs text-secondary-500">
              Format BIND, ou la sortie de « dig AXFR ». Les noms A, AAAA et CNAME de {{ d.nom }} rejoignent les découvertes ;
              un joker est compté, un CNAME dont la cible ne résout pas est signalé pendant.
            </p>
            <input
              type="file"
              accept=".zone,.db,.txt,text/plain"
              class="text-sm"
              @change="importer(d, $event)"
            >
          </div>
          <p
            v-if="formulaire(d).msg"
            class="whitespace-pre-line text-sm text-secondary-700"
          >
            {{ formulaire(d).msg }}
          </p>
        </div>
      </article>
    </section>
  </div>
</template>
