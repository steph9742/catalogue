<script setup lang="ts">
import { reactive } from 'vue'
import { UIButton, UISelect } from '@catalogue/ui'
import FormSection from '~/components/form/FormSection.vue'
import type { CatalogueField } from '~/utils/catalogues'

const props = defineProps<{
  fields: CatalogueField[]
  initial?: Record<string, unknown>
  refOptions?: Record<string, { value: string, label: string }[]>
  title?: string
  submitLabel?: string
  saving?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{ submit: [payload: Record<string, unknown>], cancel: [] }>()

const init = props.initial ?? {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const form = reactive<Record<string, any>>({})
for (const f of props.fields) {
  const v = init[f.key]
  form[f.key] = f.type === 'checkbox'
    ? Boolean(v ?? false)
    : f.type === 'multiselect'
      // La valeur arrive en tableau depuis l'API ; on ne la stringifie surtout pas.
      ? (Array.isArray(v) ? [...v] : [])
      : (v == null ? '' : String(v))
  if (f.autreKey) {
    const p = init[f.autreKey]
    form[f.autreKey] = p == null ? '' : String(p)
  }
}

const basculerMulti = (cle: string, valeur: string, coche: boolean) => {
  const actuel: string[] = Array.isArray(form[cle]) ? form[cle] : []
  form[cle] = coche ? [...new Set([...actuel, valeur])] : actuel.filter(v => v !== valeur)
}

// Champ conditionnel : visible si aucune condition, ou si l'une d'elles est vraie (OU).
const visible = (f: CatalogueField) =>
  !f.showIf || f.showIf.some(c => String(form[c.key] ?? '') === c.value)

const onSubmit = () => {
  const payload: Record<string, unknown> = {}
  for (const f of props.fields) {
    // Champ masqué (condition non remplie) → on le remet à null.
    if (!visible(f)) {
      payload[f.key] = null
      if (f.autreKey) payload[f.autreKey] = null
      continue
    }
    const v = form[f.key]
    if (f.type === 'checkbox') payload[f.key] = Boolean(v)
    // Aucune case cochée = « pas renseigné » (NULL), à distinguer de la valeur `aucune`
    // qui signifie « vérifié, rien ne le couvre ». Les deux ne se traitent pas pareil.
    else if (f.type === 'multiselect') payload[f.key] = Array.isArray(v) && v.length ? v : null
    else if (f.type === 'number') payload[f.key] = (v === '' || v == null) ? null : Number(v)
    else payload[f.key] = v === '' ? null : v
    if (f.autreKey) {
      payload[f.autreKey] = v === (f.autreValue ?? 'autre') ? (form[f.autreKey] || null) : null
    }
  }
  emit('submit', payload)
}

const labelCls = 'block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
const inputCls = 'w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2.5 text-sm text-secondary-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
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
          :title="title ?? 'Informations'"
        >
          <div class="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <template
              v-for="f in fields"
              :key="f.key"
            >
              <div
                v-if="visible(f)"
                class="space-y-2"
                :class="f.type === 'textarea' ? 'sm:col-span-2' : ''"
              >
                <label
                  v-if="f.type === 'checkbox'"
                  class="flex items-center gap-2.5 pt-6 text-sm text-secondary-700"
                >
                  <input
                    v-model="form[f.key]"
                    type="checkbox"
                    class="size-4 accent-primary-600"
                  > {{ f.label }}
                </label>
                <template v-else>
                  <label :class="labelCls">{{ f.label }}{{ f.required ? ' *' : '' }}</label>
                  <textarea
                    v-if="f.type === 'textarea'"
                    v-model="form[f.key]"
                    rows="2"
                    :class="inputCls"
                  />
                  <select
                    v-else-if="f.type === 'select'"
                    v-model="form[f.key]"
                    :required="f.required"
                    :class="inputCls"
                  >
                    <option value="">
                      —
                    </option>
                    <option
                      v-for="o in f.options"
                      :key="o.value"
                      :value="o.value"
                    >
                      {{ o.label }}
                    </option>
                  </select>
                  <!-- Multi-valué : cases à cocher plutôt qu'une liste à sélection multiple. -->
                  <div
                    v-else-if="f.type === 'multiselect'"
                    class="flex flex-wrap gap-x-4 gap-y-2 pt-1"
                  >
                    <label
                      v-for="o in f.options"
                      :key="o.value"
                      class="flex items-center gap-2 text-sm text-secondary-700"
                    >
                      <input
                        type="checkbox"
                        class="size-4 accent-primary-600"
                        :disabled="readOnly"
                        :checked="Array.isArray(form[f.key]) && (form[f.key] as string[]).includes(o.value)"
                        @change="basculerMulti(f.key, o.value, ($event.target as HTMLInputElement).checked)"
                      > {{ o.label }}
                    </label>
                  </div>
                  <UISelect
                    v-else-if="f.type === 'ref'"
                    class="!max-w-none"
                    :items="[{ value: '', label: '—' }, ...(refOptions?.[f.endpoint ?? ''] ?? [])]"
                    :multi-select="false"
                    :searchable="true"
                    :disabled="readOnly"
                    :model-value="form[f.key]"
                    placeholder="Rechercher…"
                    @update:model-value="form[f.key] = String($event ?? '')"
                  />
                  <input
                    v-else
                    v-model="form[f.key]"
                    :type="f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text')"
                    :required="f.required"
                    :placeholder="f.placeholder"
                    :class="inputCls"
                  >
                  <input
                    v-if="f.type === 'select' && f.autreKey && form[f.key] === (f.autreValue ?? 'autre')"
                    v-model="form[f.autreKey]"
                    :placeholder="`Précisez : ${f.label.toLowerCase()}`"
                    :class="inputCls"
                  >
                </template>
              </div>
            </template>
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
