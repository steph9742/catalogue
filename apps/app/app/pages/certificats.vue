<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
// CERTIFICATS TLS. La seule échéance du Catalogue dont le dépassement n'entraîne pas une
// dégradation mais un ARRÊT franc du service.
import Pill from '~/components/ui/Pill.vue'

type Certificat = {
  id: string
  hote: string
  port: number
  libelle: string | null
  proprietaire: string | null
  source: string
  surveille: boolean
  sujet: string | null
  emetteur: string | null
  nomsAlternatifs: string[] | null
  empreinte: string | null
  dateFin: string | null
  autoSigne: boolean | null
  chaineValide: boolean | null
  erreurValidation: string | null
  dernierScanAt: string | null
  dernierStatut: string
  dernierMessage: string | null
  joursRestants: number | null
  /** Calculée côté serveur : `null` tant que le certificat n'a jamais été lu. */
  autorite: string | null
  /** `null` : non relevés ; `[]` : aucun enregistrement, toute autorité peut émettre. */
  caa: string[] | null
}
type Liste = {
  total: number
  tri: string
  resultats: Certificat[]
}
type Resume = {
  total: number
  expires: number
  sous30: number
  invalides: number
  injoignables: number
  jamaisScannes: number
  parAutorite?: Record<string, number>
  sansAutorite?: number
}

const api = useApi()
// LECTURE SEULE. L'ajout et l'import d'un site vivent sur « Sites et services » : un certificat
// est une propriété d'un service exposé, et le déclarer ici créerait une fiche orpheline.

const probleme = ref(false)

const params = computed(() => ({ probleme: probleme.value ? 'true' : undefined }))
const { data: liste, refresh: refreshListe, error: erreurListe } = await useAsyncData(
  () => `certs-${probleme.value}`,
  () => api<Liste>('/api/certificats', { query: params.value }),
  { watch: [probleme], getCachedData: () => undefined },
)
const { data: resume, refresh: refreshResume } = await useAsyncData('certs-resume', () => api<Resume>('/api/certificats/resume'))
const recharger = () => Promise.all([refreshListe(), refreshResume()])

const busy = ref('')
const msg = ref('')
const msgTon = ref<'ok' | 'err'>('ok')

// --- Scan -----------------------------------------------------------------------------
const scanner = async (id?: string) => {
  busy.value = id ?? 'tous'
  msg.value = ''
  try {
    const r = await api<{ scannes: number, ok: number, echecs: number, tronque: boolean }>(
      '/api/certificats/scan', { method: 'POST', body: id ? { id } : {} },
    )
    msg.value = `${r.scannes} scanné(s) — ${r.ok} lu(s), ${r.echecs} en échec.`
      + (r.tronque ? ' Relevé PARTIEL : plafond de scan atteint.' : '')
    msgTon.value = r.echecs && !r.ok ? 'err' : 'ok'
    await recharger()
  }
  catch {
    msg.value = 'Le scan a échoué.'
    msgTon.value = 'err'
  }
  finally { busy.value = '' }
}

const retirer = async (c: Certificat) => {
  if (!confirm(`Retirer ${c.hote}:${c.port} de l'inventaire ?`)) return
  await api(`/api/certificats/${c.id}`, { method: 'DELETE' })
  await recharger()
}

// Teinte de l'échéance. Un certificat jamais scanné n'est pas « vert » : on ne sait
// simplement rien, et c'est un état à part.
const tonEcheance = (c: Certificat) => {
  if (c.joursRestants === null) return 'gray'
  if (c.joursRestants < 0) return 'red'
  if (c.joursRestants <= 14) return 'red'
  if (c.joursRestants <= 30) return 'amber'
  return 'emerald'
}
const libelleEcheance = (c: Certificat) => {
  if (c.joursRestants === null) return 'jamais relevé'
  if (c.joursRestants < 0) return `expiré depuis ${-c.joursRestants} j`
  return `${c.joursRestants} j`
}
const dateFr = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—')

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="flex items-center gap-2 tracking-tight text-secondary-900">
        <Icon
          name="lucide:shield-check"
          class="size-5 text-primary-500"
        />
        Certificats TLS
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        La date d'expiration est relevée sur le certificat présenté par le service. Elle n'est pas
        saisie manuellement.
      </p>
    </header>

    <section
      v-if="resume"
      class="grid grid-cols-2 gap-3 sm:grid-cols-5"
    >
      <div
        v-for="t in [
          { n: resume.total, label: 'surveillés', alerte: false },
          { n: resume.expires, label: 'EXPIRÉS', alerte: resume.expires > 0 },
          { n: resume.sous30, label: 'sous 30 jours', alerte: resume.sous30 > 0 },
          { n: resume.invalides, label: 'chaîne invalide', alerte: resume.invalides > 0 },
          { n: resume.jamaisScannes, label: 'jamais relevés', alerte: resume.jamaisScannes > 0 },
        ]"
        :key="t.label"
        class="rounded-2xl border border-secondary-200/70 bg-white p-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
      >
        <span
          class="block text-xl font-semibold leading-none tracking-tight"
          :class="t.alerte ? 'text-red-700' : 'text-secondary-900'"
        >{{ t.n }}</span>
        <span class="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">{{ t.label }}</span>
      </div>
    </section>

    <!-- Une partition des certificats lus ; les jamais lus sont comptés à part. -->
    <section
      v-if="resume?.parAutorite"
      class="flex flex-wrap items-center gap-2 text-xs"
    >
      <span class="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary-400">Par autorité</span>
      <Pill
        v-for="(n, k) in resume.parAutorite"
        v-show="n"
        :key="k"
        :tone="AUTORITE_CERTIFICAT[k]?.t ?? 'gray'"
      >
        {{ AUTORITE_CERTIFICAT[k]?.l ?? k }} : {{ n }}
      </Pill>
      <span
        v-if="resume.sansAutorite"
        class="text-secondary-500"
      >{{ resume.sansAutorite }} jamais lu(s)</span>
    </section>

    <section :class="[TUILE, '!p-5 space-y-4']">
      <div class="flex flex-wrap items-center gap-2.5">
        <UIButton
          variant="outline"
          :disabled="!!busy"
          @click="scanner()"
        >
          <Icon
            name="lucide:radar"
            class="size-4"
            :class="busy === 'tous' ? 'animate-spin' : ''"
          /> Scanner tout
        </UIButton>
        <UIButton
          :variant="probleme ? 'danger' : 'outline'"
          @click="probleme = !probleme"
        >
          <Icon
            name="lucide:filter"
            class="size-4"
          /> Ce qui pose problème
        </UIButton>
        <span
          v-if="msg"
          class="text-sm"
          :class="msgTon === 'ok' ? 'text-emerald-600' : 'text-red-600'"
        >{{ msg }}</span>
      </div>

      <!-- L'AJOUT ET L'IMPORT VIVENT SUR « Sites et services ». Un certificat est une propriété d'un service exposé : le déclarer ici créerait un certificat sans service, donc une fiche orpheline. -->
      <p class="border-t border-secondary-200/60 pt-4 text-sm text-secondary-600">
        Pour ajouter ou importer un site,
        <NuxtLink
          to="/sites-services"
          class="text-primary-700 hover:underline"
        >Sites et services</NuxtLink>. Le certificat y est relevé avec le reste du service.
      </p>
    </section>

    <!-- UNE ERREUR NE DOIT PAS SE LIRE COMME UN INVENTAIRE VIDE. La requête a échoué en base pendant plusieurs jours et la page affichait « aucun certificat » : le défaut était invisible parce que son symptôme était plausible. -->
    <p
      v-if="erreurListe"
      :class="[TUILE, '!border-red-200 !bg-red-50/50 text-sm text-red-800']"
    >
      La liste n'a pas pu être chargée. Les compteurs ci-dessus viennent d'une autre requête et restent valides. L'inventaire n'est pas nécessairement vide.
      <span class="mt-1 block font-mono text-[11px] opacity-80">{{ erreurListe.message }}</span>
    </p>
    <p
      v-else-if="!liste?.resultats?.length"
      :class="[TUILE, 'text-sm text-secondary-500']"
    >
      Aucun certificat inventorié. Ajouter une entrée, ou importer une liste de sites.
    </p>

    <div class="space-y-2">
      <article
        v-for="c in liste?.resultats ?? []"
        :key="c.id"
        class="rounded-2xl border bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] sm:p-5"
        :class="(c.joursRestants !== null && c.joursRestants < 0) || c.chaineValide === false
          ? 'border-red-200 bg-red-50/40'
          : 'border-secondary-200/60'"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium tracking-tight text-secondary-900">{{ c.libelle ?? c.hote }}</span>
          <span class="font-mono text-xs text-secondary-500">{{ c.hote }}<template v-if="c.port !== 443">:{{ c.port }}</template></span>

          <Pill :tone="tonEcheance(c)">
            {{ libelleEcheance(c) }}
          </Pill>
          <Pill
            v-if="c.chaineValide === false && c.erreurValidation !== 'CERT_HAS_EXPIRED'"
            tone="red"
          >
            {{ c.erreurValidation ?? 'non validé' }}
          </Pill>
          <!-- L'AUTORITÉ, seulement quand elle n'est pas déjà dite : expiré, auto-signé et chaîne
               invalide ont leur propre pastille. -->
          <Pill
            v-if="c.autorite && ['harica', 'lets_encrypt', 'autre_commerciale', 'autorite_inattendue'].includes(c.autorite)"
            :tone="AUTORITE_CERTIFICAT[c.autorite]?.t ?? 'gray'"
          >
            {{ AUTORITE_CERTIFICAT[c.autorite]?.l ?? c.autorite }}
          </Pill>
          <Pill
            v-if="c.autoSigne"
            tone="orange"
          >
            Auto-signé
          </Pill>
          <Pill
            v-if="c.dernierStatut === 'injoignable' || c.dernierStatut === 'tls_erreur'"
            tone="amber"
          >
            {{ c.dernierStatut }}
          </Pill>

          <span class="ml-auto flex shrink-0 items-center gap-1">
            <button
              class="rounded-md p-1.5 text-secondary-400 transition-colors hover:bg-secondary-50 hover:text-secondary-700"
              title="Scanner ce certificat"
              :disabled="!!busy"
              @click="scanner(c.id)"
            >
              <Icon
                name="lucide:refresh-cw"
                class="size-4"
                :class="busy === c.id ? 'animate-spin' : ''"
              />
            </button>
            <button
              class="rounded-md p-1.5 text-secondary-400 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Retirer de l'inventaire"
              @click="retirer(c)"
            >
              <Icon
                name="lucide:trash-2"
                class="size-4"
              />
            </button>
          </span>
        </div>

        <p class="mt-1 flex flex-wrap gap-x-4 text-[11px] text-secondary-500">
          <span v-if="c.dateFin">Expire le <strong class="text-secondary-700">{{ dateFr(c.dateFin) }}</strong></span>
          <span v-if="c.emetteur">Émis par {{ c.emetteur }}</span>
          <span v-if="c.caa">CAA : {{ c.caa.length ? c.caa.join(', ') : 'aucun enregistrement, toute autorité peut émettre' }}</span>
          <span v-if="c.proprietaire">Responsable : {{ c.proprietaire }}</span>
          <!-- Fraîcheur : sans elle, un relevé de six mois s'affiche avec le même
               aplomb qu'un relevé du matin. -->
          <span class="text-secondary-400">Relevé le {{ dateFr(c.dernierScanAt) }}</span>
        </p>

        <p
          v-if="c.nomsAlternatifs?.length && c.nomsAlternatifs.length > 1"
          class="mt-0.5 font-mono text-[10px] text-secondary-400"
        >
          Couvre aussi : {{ c.nomsAlternatifs.filter(n => n !== c.hote).slice(0, 6).join(', ') }}
        </p>
        <p
          v-if="c.dernierStatut !== 'ok' && c.dernierMessage"
          class="mt-0.5 text-[11px] text-amber-800"
        >
          {{ c.dernierMessage }}
        </p>
      </article>
    </div>
  </div>
</template>
