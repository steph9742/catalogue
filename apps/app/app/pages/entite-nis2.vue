<script setup lang="ts">
import { nis2StatutsEntite, nis2Secteurs, labelOf } from '~/utils/catalogueEnums'

// Statut de l'entité au regard de NIS 2 — page singleton. Détermine l'obligation réglementaire
// (essentielle vs importante ⇒ intensité des contrôles et des sanctions) et matérialise
// l'enregistrement auprès de l'ANSSI.

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('exigences-nis2')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
const editable = computed(() => perms.canWrite('exigences-nis2'))

type Entite = {
  statut: string
  secteur: string | null
  secteurAutre: string | null
  enregistreAnssi: boolean
  identifiantAnssi: string | null
  dateEnregistrement: string | null
  referentId: string | null
  justificationStatut: string | null
  notes: string | null
}
type Personne = { id: string, nom: string, prenom: string | null }

const { data: entite, refresh } = await useAsyncData('entite-nis2', () => api<Entite>('/api/entite-nis2'), { getCachedData: () => undefined })
const { data: personnes } = await useAsyncData('entite-nis2-personnes', () => api<Personne[]>('/api/personnes'), { getCachedData: () => undefined })
const optionsPersonnes = computed(() =>
  (personnes.value ?? []).map(p => ({ id: p.id, label: `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim() })).sort((a, b) => a.label.localeCompare(b.label)))

// Brouillon local édité par le formulaire, réhydraté à chaque chargement.
const f = reactive<Entite>({
  statut: 'a_determiner', secteur: null, secteurAutre: null, enregistreAnssi: false,
  identifiantAnssi: null, dateEnregistrement: null, referentId: null, justificationStatut: null, notes: null,
})
watchEffect(() => {
  if (entite.value) Object.assign(f, entite.value)
})

const STATUT_TONE: Record<string, string> = {
  essentielle: 'border-red-200 bg-red-50 text-red-700',
  importante: 'border-orange-200 bg-orange-50 text-orange-700',
  non_assujettie: 'border-secondary-200 bg-secondary-50 text-secondary-500',
  a_determiner: 'border-amber-200 bg-amber-50 text-amber-700',
}

const enregistrement = ref('')
const saving = ref(false)
const enregistrer = async () => {
  if (saving.value) return
  saving.value = true
  enregistrement.value = ''
  try {
    await api('/api/entite-nis2', { method: 'PUT', body: { ...f } })
    await refresh()
    enregistrement.value = 'ok'
  }
  catch { enregistrement.value = 'err' }
  finally { saving.value = false }
}

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-6 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const LIBELLE = 'font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Mon entité NIS 2
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Statut réglementaire de l'établissement et enregistrement ANSSI.
        </p>
      </div>
      <span
        v-if="entite"
        class="inline-flex items-center gap-1.5 self-start rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider sm:self-auto"
        :class="STATUT_TONE[entite.statut]"
      >
        <Icon
          name="lucide:shield"
          class="size-3.5"
        />{{ labelOf(nis2StatutsEntite, entite.statut) }}
      </span>
    </header>

    <fieldset
      :disabled="!editable"
      class="m-0 min-w-0 border-0 p-0"
    >
      <section :class="[TUILE, 'space-y-5']">
        <div class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span :class="LIBELLE">Statut de l'entité</span>
            <select
              v-model="f.statut"
              :class="CHAMP"
            >
              <option
                v-for="s in nis2StatutsEntite"
                :key="s.value"
                :value="s.value"
              >{{ s.label }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span :class="LIBELLE">Secteur (directive 2022/2555)</span>
            <select
              v-model="f.secteur"
              :class="CHAMP"
            >
              <option :value="null">—</option>
              <option
                v-for="s in nis2Secteurs"
                :key="s.value"
                :value="s.value"
              >{{ s.label }}</option>
            </select>
          </label>
          <label
            v-if="f.secteur === 'autre'"
            class="flex flex-col gap-1.5 sm:col-span-2"
          >
            <span :class="LIBELLE">Précision du secteur</span>
            <input
              v-model="f.secteurAutre"
              :class="CHAMP"
              placeholder="Secteur précis"
            >
          </label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span :class="LIBELLE">Justification du statut</span>
            <textarea
              v-model="f.justificationStatut"
              rows="2"
              :class="CHAMP"
              placeholder="Ce qui fonde le classement essentielle / importante (taille, secteur, criticité…)"
            />
          </label>
        </div>
      </section>

      <section :class="[TUILE, 'mt-5 space-y-5']">
        <h2 class="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
          <Icon
            name="lucide:landmark"
            class="size-4 text-primary-500"
          /> Enregistrement ANSSI
        </h2>
        <label class="flex items-center gap-2 text-sm text-secondary-700">
          <input
            v-model="f.enregistreAnssi"
            type="checkbox"
            class="size-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500/30"
          >
          L'entité est enregistrée auprès de l'ANSSI
        </label>
        <div class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span :class="LIBELLE">Identifiant ANSSI</span>
            <input
              v-model="f.identifiantAnssi"
              :class="CHAMP"
              placeholder="Référence du téléservice"
            >
          </label>
          <label class="flex flex-col gap-1.5">
            <span :class="LIBELLE">Date d'enregistrement</span>
            <input
              v-model="f.dateEnregistrement"
              type="date"
              :class="CHAMP"
            >
          </label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span :class="LIBELLE">Référent NIS 2 (point de contact)</span>
            <select
              v-model="f.referentId"
              :class="CHAMP"
            >
              <option :value="null">Non désigné</option>
              <option
                v-for="p in optionsPersonnes"
                :key="p.id"
                :value="p.id"
              >{{ p.label }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span :class="LIBELLE">Notes</span>
            <textarea
              v-model="f.notes"
              rows="2"
              :class="CHAMP"
            />
          </label>
        </div>
      </section>

      <div
        v-if="editable"
        class="mt-5 flex items-center gap-3"
      >
        <button
          :disabled="saving"
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          @click="enregistrer"
        >
          <Icon
            :name="saving ? 'lucide:loader-circle' : 'lucide:save'"
            class="size-4"
            :class="saving ? 'animate-spin' : ''"
          /> Enregistrer
        </button>
        <span
          v-if="enregistrement === 'ok'"
          class="text-sm text-emerald-600"
        >Enregistré.</span>
        <span
          v-else-if="enregistrement === 'err'"
          class="text-sm text-red-600"
        >Échec de l'enregistrement.</span>
      </div>
    </fieldset>
  </div>
</template>
