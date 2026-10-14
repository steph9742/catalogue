<script setup lang="ts">
import { reactive, ref } from 'vue'
import { UIButton } from '@catalogue/ui'
import FormSection from '~/components/form/FormSection.vue'
import EventSelector from '~/components/EventSelector.vue'

const props = defineProps<{ initial?: Record<string, unknown>, submitLabel?: string, saving?: boolean }>()
const emit = defineEmits<{ submit: [payload: Record<string, unknown>], cancel: [] }>()

const init = props.initial ?? {}
const str = (v: unknown, fb = '') => (v == null ? fb : String(v))
const form = reactive({
  nom: str(init.nom),
  url: str(init.url),
  secret: str(init.secret),
  actif: init.actif == null ? true : Boolean(init.actif),
})
const events = ref<string[]>(Array.isArray(init.events) ? (init.events as string[]) : [])

const onSubmit = () => emit('submit', {
  nom: form.nom,
  url: form.url,
  secret: form.secret.trim() === '' ? null : form.secret,
  actif: form.actif,
  events: events.value,
})

const labelCls = 'block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500'
const inputCls = 'w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2.5 text-sm text-secondary-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div class="overflow-hidden rounded-2xl border border-secondary-200/80 bg-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)]">
      <FormSection
        :n="1"
        title="Configuration"
      >
        <div class="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
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
              for="url"
            >URL (webhook n8n) *</label>
            <input
              id="url"
              v-model="form.url"
              type="url"
              required
              placeholder="https://n8n…/webhook/…"
              :class="inputCls"
            >
          </div>
          <div class="space-y-2 sm:col-span-2">
            <label
              :class="labelCls"
              for="secret"
            >Secret (en-tête x-webhook-secret)</label>
            <input
              id="secret"
              v-model="form.secret"
              :class="inputCls"
            >
          </div>
          <label class="flex items-center gap-2.5 text-sm text-secondary-700">
            <input
              v-model="form.actif"
              type="checkbox"
              class="size-4 accent-primary-600"
            > Actif
          </label>
        </div>
      </FormSection>

      <FormSection
        :n="2"
        title="Événements envoyés"
        tint
      >
        <EventSelector v-model="events" />
      </FormSection>

      <div class="flex items-center justify-end gap-3 border-t border-secondary-100 bg-secondary-50/60 p-6 sm:px-8 sm:py-5">
        <UIButton
          type="button"
          variant="outline"
          @click="emit('cancel')"
        >
          Annuler
        </UIButton>
        <UIButton
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
