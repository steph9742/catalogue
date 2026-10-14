<script setup lang="ts">
// RÉFÉRENTIELS — administration des jeux de données de référence. Ils étaient invisibles
// (chargés au démarrage) : impossible de savoir d'où venait une donnée ni de la recharger.

const api = useApi()
const perms = await usePermissions()
if (!perms.isAdmin.value) throw createError({ statusCode: 403, statusMessage: 'Réservé aux administrateurs' })

type Ref = { cle: string, nom: string, source: string, description: string, attendus: number | null, enBase: number, importable: boolean }
const { data: refs, refresh } = await useAsyncData('referentiels', () => api<Ref[]>('/api/referentiels'), { getCachedData: () => undefined })

const busy = ref('')
const messages = reactive<Record<string, { texte: string, ok: boolean }>>({})
// Références présentes en base mais absentes du fichier officiel — vestiges d'une version
// antérieure. Leur suppression est une action à part : elle emporte le travail rattaché.
const obsoletes = ref<string[]>([])

const purger = async () => {
  if (busy.value) return
  busy.value = 'nis2'
  try {
    const r = await api<{ message: string }>('/api/referentiels/nis2/purger', { method: 'POST' })
    messages.nis2 = { texte: r.message, ok: true }
    obsoletes.value = []
    await refresh()
  }
  catch { messages.nis2 = { texte: 'La suppression a échoué.', ok: false } }
  finally { busy.value = '' }
}

const importer = async (r: Ref) => {
  if (busy.value) return
  busy.value = r.cle
  try {
    const res = await api<{ ok: boolean, message: string, obsoletes?: string[] }>(`/api/referentiels/${r.cle}/importer`, { method: 'POST' })
    messages[r.cle] = { texte: res.message, ok: res.ok }
    if (r.cle === 'nis2') obsoletes.value = res.obsoletes ?? []
    await refresh()
  }
  catch (e) {
    const m = (e as { data?: { message?: string } })?.data?.message
    messages[r.cle] = { texte: m ?? 'Import impossible.', ok: false }
  }
  finally { busy.value = '' }
}

// Écart entre ce que la source annonce et ce qui est en base : c'est le seul indicateur
// qui compte pour savoir si un import est nécessaire.
const etat = (r: Ref) => {
  if (r.attendus === null) return { label: 'Volumétrie inconnue', cls: 'border-secondary-200 bg-secondary-50 text-secondary-600' }
  if (r.enBase === 0) return { label: 'Non chargé', cls: 'border-amber-200 bg-amber-50 text-amber-700' }
  if (r.enBase === r.attendus) return { label: 'À jour', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  return { label: `Écart : ${r.enBase} / ${r.attendus}`, cls: 'border-red-200 bg-red-50 text-red-700' }
}

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Référentiels
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Les jeux de données de référence embarqués par l'application : d'où ils viennent, ce qu'ils contiennent, et comment les recharger.
      </p>
    </header>

    <section
      v-for="r in refs ?? []"
      :key="r.cle"
      :class="[TUILE, 'space-y-3']"
    >
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="flex flex-wrap items-center gap-2 font-medium tracking-tight text-secondary-900">
            {{ r.nom }}
            <span
              class="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
              :class="etat(r).cls"
            >{{ etat(r).label }}</span>
          </h2>
          <p class="mt-1 text-sm text-secondary-600">
            {{ r.description }}
          </p>
          <p class="mt-1 text-xs text-secondary-400">
            Source : {{ r.source }}
          </p>
        </div>
        <div class="shrink-0 text-right">
          <span class="block text-xl font-semibold leading-none tracking-tight text-secondary-900">{{ r.enBase }}</span>
          <span class="mt-1 block font-mono text-[10px] uppercase tracking-widest text-secondary-400">en base</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 border-t border-secondary-100 pt-3">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          :class="r.importable ? 'bg-primary-600 text-white hover:bg-primary-700' : 'border border-secondary-200/80 text-secondary-500'"
          :disabled="busy === r.cle || !r.importable"
          @click="importer(r)"
        >
          <Icon
            name="lucide:download"
            class="size-4"
            :class="busy === r.cle ? 'animate-pulse' : ''"
          />
          {{ busy === r.cle ? 'Import…' : 'Importer / mettre à jour' }}
        </button>
        <span
          v-if="messages[r.cle]"
          class="text-sm"
          :class="messages[r.cle]!.ok ? 'text-emerald-600' : 'text-red-600'"
        >
          {{ messages[r.cle]!.texte }}
        </span>
      </div>

      <!-- Exigences hors référentiel : signalées, jamais supprimées sans décision. -->
      <div
        v-if="r.cle === 'nis2' && obsoletes.length"
        class="rounded-xl border border-amber-200 bg-amber-50/70 p-3"
      >
        <p class="text-sm font-medium text-amber-900">
          {{ obsoletes.length }} exigence(s) en base ne figurent pas dans le fichier officiel
        </p>
        <p class="mt-1 text-xs text-amber-800">
          {{ obsoletes.join(', ') }} — vestiges d'une version antérieure du référentiel.
          Les supprimer emporte la conformité déclarée, le plan d'action et les preuves qui y sont rattachés.
        </p>
        <button
          class="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          :disabled="busy === 'nis2'"
          @click="purger"
        >
          Supprimer ces {{ obsoletes.length }} exigence(s)
        </button>
      </div>
    </section>

    <p class="text-center text-xs text-secondary-400">
      L'import met à jour le contenu du référentiel (intitulés, applicabilité, rattachements) sans toucher à votre travail : conformité déclarée, plans d'action, responsables et preuves sont conservés.
    </p>
  </div>
</template>
