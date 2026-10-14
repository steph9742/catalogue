<script setup lang="ts">
import { reactive, computed } from 'vue'
import { UIButton } from '@catalogue/ui'
import FormSection from '~/components/form/FormSection.vue'
import { tiersTypes, tiersNiveauAcces, type EnumOption } from '~/utils/catalogueEnums'

const props = defineProps<{
  initial?: Record<string, unknown>
  personnes: EnumOption[]
  submitLabel?: string
  saving?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{ submit: [payload: Record<string, unknown>], cancel: [] }>()

const init = props.initial ?? {}
const str = (v: unknown, fb = '') => (v == null ? fb : String(v))

const core = reactive({
  nom: str(init.nom),
  type: str(init.type, 'prestataire_it'),
  activite: str(init.activite),
  contratRef: str(init.contratRef),
  contratFin: str(init.contratFin),
  niveauAcces: str(init.niveauAcces),
  notesSecurite: str(init.notesSecurite),
})

type ContactRow = { nom: string, email: string, telephone: string, fonction: string, principal: boolean }
type ReferentRow = { personneId: string, role: string, principal: boolean }

const contacts = reactive<ContactRow[]>(
  Array.isArray(init.contacts)
    ? (init.contacts as Record<string, unknown>[]).map(c => ({
        nom: str(c.nom), email: str(c.email), telephone: str(c.telephone),
        fonction: str(c.fonction), principal: Boolean(c.principal),
      }))
    : [],
)
const referents = reactive<ReferentRow[]>(
  Array.isArray(init.referents)
    ? (init.referents as Record<string, unknown>[]).map(r => ({
        personneId: str(r.personneId), role: str(r.role), principal: Boolean(r.principal),
      }))
    : [],
)

const addContact = () => contacts.push({ nom: '', email: '', telephone: '', fonction: '', principal: false })
const addReferent = () => referents.push({ personneId: '', role: '', principal: false })

const isPrestataire = computed(() => core.type === 'prestataire_it' || core.type === 'prestataire_non_it')
const contactsOk = computed(() => contacts.some(c => c.nom.trim()))
const referentsOk = computed(() => referents.some(r => r.personneId))
const valid = computed(() => !isPrestataire.value || (contactsOk.value && referentsOk.value))

const clean = (v: string) => (v.trim() === '' ? null : v)

const onSubmit = () => {
  if (!valid.value) return
  emit('submit', {
    nom: core.nom,
    type: core.type,
    activite: clean(core.activite),
    contratRef: clean(core.contratRef),
    contratFin: clean(core.contratFin),
    niveauAcces: clean(core.niveauAcces),
    notesSecurite: clean(core.notesSecurite),
    contacts: contacts.filter(c => c.nom.trim()),
    referents: referents.filter(r => r.personneId),
  })
}

const labelCls = 'block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
const inputCls = 'w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2.5 text-sm text-secondary-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
const grid = 'grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2'
const addBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-secondary-200 bg-white px-3 py-1.5 text-sm text-secondary-700 shadow-sm transition-colors hover:bg-secondary-50'
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
          title="Tiers"
        >
          <div :class="grid">
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="nom"
              >Nom *</label>
              <input
                id="nom"
                v-model="core.nom"
                required
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="type"
              >Type *</label>
              <select
                id="type"
                v-model="core.type"
                required
                :class="inputCls"
              >
                <option
                  v-for="o in tiersTypes"
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
                for="activite"
              >Activité</label>
              <input
                id="activite"
                v-model="core.activite"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="niveau"
              >Niveau d'accès</label>
              <select
                id="niveau"
                v-model="core.niveauAcces"
                :class="inputCls"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="o in tiersNiveauAcces"
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
                for="contrat"
              >Référence marché / contrat</label>
              <input
                id="contrat"
                v-model="core.contratRef"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2">
              <label
                :class="labelCls"
                for="fin"
              >Fin de contrat</label>
              <input
                id="fin"
                v-model="core.contratFin"
                type="date"
                :class="inputCls"
              >
            </div>
            <div class="space-y-2 sm:col-span-2">
              <label
                :class="labelCls"
                for="notes"
              >Notes sécurité (RGPD, PSSI, habilitations)</label>
              <textarea
                id="notes"
                v-model="core.notesSecurite"
                rows="2"
                :class="inputCls"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          :n="2"
          title="Contacts prestataire"
          tint
        >
          <template #default>
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm text-secondary-500">
                <span
                  v-if="isPrestataire"
                  class="font-medium text-primary-700"
                >Requis pour un prestataire</span>
                <span v-else>Optionnel</span>
              </span>
              <button
                type="button"
                :class="addBtn"
                @click="addContact"
              >
                <Icon
                  name="lucide:plus"
                  class="size-4"
                /> Contact
              </button>
            </div>
            <div
              v-if="!contacts.length"
              class="text-sm text-secondary-400"
            >
              Aucun contact.
            </div>
            <div class="space-y-3">
              <div
                v-for="(c, i) in contacts"
                :key="i"
                class="grid grid-cols-1 gap-2 rounded-xl border border-secondary-200/70 bg-white p-3 sm:grid-cols-5"
              >
                <input
                  v-model="c.nom"
                  placeholder="Nom *"
                  :class="inputCls"
                >
                <input
                  v-model="c.email"
                  placeholder="E-mail"
                  :class="inputCls"
                >
                <input
                  v-model="c.telephone"
                  placeholder="Téléphone"
                  :class="inputCls"
                >
                <input
                  v-model="c.fonction"
                  placeholder="Fonction"
                  :class="inputCls"
                >
                <div class="flex items-center justify-between gap-2">
                  <label class="flex items-center gap-1.5 text-xs text-secondary-600"><input
                    v-model="c.principal"
                    type="checkbox"
                    class="size-4 accent-primary-600"
                  > Principal</label>
                  <button
                    type="button"
                    aria-label="Retirer"
                    class="text-secondary-400 hover:text-red-600"
                    @click="contacts.splice(i, 1)"
                  >
                    <Icon
                      name="lucide:x"
                      class="size-4"
                    />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </FormSection>

        <FormSection
          :n="3"
          title="Référents internes (univ)"
        >
          <template #default>
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm text-secondary-500">
                <span
                  v-if="isPrestataire"
                  class="font-medium text-primary-700"
                >Requis pour un prestataire</span>
                <span v-else>Optionnel</span>
              </span>
              <button
                type="button"
                :class="addBtn"
                @click="addReferent"
              >
                <Icon
                  name="lucide:plus"
                  class="size-4"
                /> Référent
              </button>
            </div>
            <div
              v-if="!referents.length"
              class="text-sm text-secondary-400"
            >
              Aucun référent.
            </div>
            <div class="space-y-3">
              <div
                v-for="(r, i) in referents"
                :key="i"
                class="grid grid-cols-1 gap-2 rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3 sm:grid-cols-3"
              >
                <select
                  v-model="r.personneId"
                  :class="inputCls"
                >
                  <option value="">
                    — Personne —
                  </option>
                  <option
                    v-for="p in personnes"
                    :key="p.value"
                    :value="p.value"
                  >
                    {{ p.label }}
                  </option>
                </select>
                <input
                  v-model="r.role"
                  placeholder="Rôle (contractuel, technique…)"
                  :class="inputCls"
                >
                <div class="flex items-center justify-between gap-2">
                  <label class="flex items-center gap-1.5 text-xs text-secondary-600"><input
                    v-model="r.principal"
                    type="checkbox"
                    class="size-4 accent-primary-600"
                  > Principal</label>
                  <button
                    type="button"
                    aria-label="Retirer"
                    class="text-secondary-400 hover:text-red-600"
                    @click="referents.splice(i, 1)"
                  >
                    <Icon
                      name="lucide:x"
                      class="size-4"
                    />
                  </button>
                </div>
              </div>
            </div>
            <p
              v-if="!readOnly && isPrestataire && !valid"
              class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              Un prestataire doit avoir au moins un contact et un référent interne.
            </p>
          </template>
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
          :disabled="saving || !valid"
          class="font-medium tracking-tight shadow-sm shadow-primary-500/20 transition-all duration-300 hover:shadow-md hover:shadow-primary-500/30"
        >
          {{ saving ? 'Enregistrement…' : (submitLabel ?? 'Enregistrer') }}
        </UIButton>
      </div>
    </div>
  </form>
</template>
