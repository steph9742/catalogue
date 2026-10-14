<script setup lang="ts">
import { reactive } from 'vue'
import { UIButton } from '@catalogue/ui'
import FormSection from '~/components/form/FormSection.vue'
import {
  logicielCategories, logicielLicences, logicielInstallations, logicielStatuts,
} from '~/utils/catalogueEnums'

const props = defineProps<{
  initial?: Record<string, unknown>
  populations: { id: string, nom: string }[]
  submitLabel?: string
  saving?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: Record<string, unknown>]
  cancel: []
}>()

const init = props.initial ?? {}
const str = (v: unknown, fallback = '') => (v == null ? fallback : String(v))
const form = reactive({
  nom: str(init.nom),
  editeur: str(init.editeur),
  version: str(init.version),
  categorie: str(init.categorie, 'utilitaire'),
  categoriePrecision: str(init.categoriePrecision),
  statut: str(init.statut, 'autorise'),
  typeLicence: str(init.typeLicence),
  typeLicencePrecision: str(init.typeLicencePrecision),
  installation: str(init.installation),
  url: str(init.url),
  description: str(init.description),
  notes: str(init.notes),
  populationIds: (Array.isArray(init.populationIds) ? init.populationIds : []) as string[],
})

const clean = (v: unknown) => (v === '' ? null : v)

const onSubmit = () => {
  emit('submit', {
    nom: form.nom,
    editeur: clean(form.editeur),
    version: clean(form.version),
    categorie: form.categorie,
    categoriePrecision: form.categorie === 'autre' ? (form.categoriePrecision || null) : null,
    statut: form.statut,
    typeLicence: clean(form.typeLicence),
    typeLicencePrecision: form.typeLicence === 'autre' ? (form.typeLicencePrecision || null) : null,
    installation: clean(form.installation),
    url: clean(form.url),
    description: clean(form.description),
    notes: clean(form.notes),
    populationIds: [...form.populationIds],
  })
}

const labelCls = 'block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
const inputCls = 'w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2.5 text-sm text-secondary-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const grid = 'grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2'
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div class="overflow-hidden rounded-2xl border border-secondary-200/80 bg-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)]">
      <fieldset
        :disabled="readOnly"
        class="m-0 min-w-0 border-0 p-0"
      >
        <FormSection
          :n="1"
          title="Logiciel"
        >
          <div :class="grid">
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="nom"
              >Nom *</label>
              <input
                id="nom"
                v-model="form.nom"
                required
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="editeur"
              >Éditeur</label>
              <input
                id="editeur"
                v-model="form.editeur"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="categorie"
              >Catégorie *</label>
              <select
                id="categorie"
                v-model="form.categorie"
                required
                :class="inputCls"
              >
                <option
                  v-for="o in logicielCategories"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
              <input
                v-if="form.categorie === 'autre'"
                v-model="form.categoriePrecision"
                placeholder="Précisez la catégorie"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="version"
              >Version</label>
              <input
                id="version"
                v-model="form.version"
                placeholder="ex. ≥ 115"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="statut"
              >Statut</label>
              <select
                id="statut"
                v-model="form.statut"
                :class="inputCls"
              >
                <option
                  v-for="o in logicielStatuts"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="licence"
              >Type de licence</label>
              <select
                id="licence"
                v-model="form.typeLicence"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in logicielLicences"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
              <input
                v-if="form.typeLicence === 'autre'"
                v-model="form.typeLicencePrecision"
                placeholder="Précisez le type de licence"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="install"
              >Installation</label>
              <select
                id="install"
                v-model="form.installation"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in logicielInstallations"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="url"
              >Lien éditeur</label>
              <input
                id="url"
                v-model="form.url"
                type="url"
                placeholder="https://…"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2 sm:col-span-2">
              <label
                :class="labelCls"
                for="description"
              >Description</label>
              <textarea
                id="description"
                v-model="form.description"
                rows="2"
                :class="inputCls"
              />
            </div>
            <div class="space-y-2 sm:col-span-2">
              <label
                :class="labelCls"
                for="notes"
              >Notes</label>
              <textarea
                id="notes"
                v-model="form.notes"
                rows="2"
                :class="inputCls"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          :n="2"
          title="Populations autorisées"
          tint
        >
          <p
            v-if="!populations.length"
            class="text-sm text-secondary-500"
          >
            Aucune population enregistrée. Lancez le seed ou créez-les d'abord.
          </p>
          <div
            v-else
            class="flex flex-wrap gap-2"
          >
            <label
              v-for="p in populations"
              :key="p.id"
              class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm text-secondary-700 transition-colors has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50 has-[:checked]:text-primary-800"
            >
              <input
                v-model="form.populationIds"
                type="checkbox"
                :value="p.id"
                class="size-4 accent-primary-600"
              >
              {{ p.nom }}
            </label>
          </div>
        </FormSection>
      </fieldset>

      <div class="flex items-center justify-end gap-3 border-t border-secondary-100 bg-secondary-50/60 p-6 sm:px-8 sm:py-5">
        <UIButton
          type="button"
          variant="outline"
          @click="emit('cancel')"
        >
          {{ readOnly ? 'Retour' : 'Annuler' }}
        </UIButton>
        <UIButton
          v-if="!readOnly"
          type="submit"
          variant="primary"
          :disabled="saving"
          class="font-medium tracking-tight shadow-sm shadow-primary-500/20 transition-all duration-300 hover:shadow-md hover:shadow-primary-500/30"
        >
          {{ saving ? 'Enregistrement…' : (submitLabel ?? 'Enregistrer') }}
        </UIButton>
      </div>
    </div>
  </form>
</template>
