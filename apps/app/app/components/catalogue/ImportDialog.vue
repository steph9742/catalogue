<script setup lang="ts">
import { ref, computed } from 'vue'
import { UIButton } from '@catalogue/ui'
import { parseSpreadsheet, downloadTemplate } from '~/utils/tableExport'
import { coerceImportValue } from '~/utils/payloadDescribe'

const props = defineProps<{
  endpoint: string
  naturalKey: string
  label: string
  fields: { key: string, label: string }[]
}>()

const emit = defineEmits<{ close: [], imported: [] }>()

const api = useApi()

type Report = {
  dryRun: boolean
  total: number
  created: number
  updated: number
  relatedCreated?: { label: string, nom: string }[]
  errors: { line: number, cle: string, message: string }[]
}

const loading = ref(false)
const errorMessage = ref('')
const report = ref<Report | null>(null)
const mappedRows = ref<Record<string, unknown>[]>([])
const fileName = ref('')

// En-têtes acceptés → clé technique (par clé ou par libellé, insensible à la casse).
const headerMap = computed(() => {
  const m: Record<string, string> = {}
  for (const f of props.fields) {
    m[f.key.toLowerCase().trim()] = f.key
    m[f.label.toLowerCase().trim()] = f.key
  }
  return m
})

const remap = (rows: Record<string, string>[]) =>
  rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(row)) {
      const key = headerMap.value[header.toLowerCase().trim()]
      // Tolérance : libellés d'enum → valeurs, « oui/non » → booléen (pour réimporter un export).
      if (key) out[key] = coerceImportValue(props.endpoint, key, value)
    }
    return out
  })

const onFile = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  errorMessage.value = ''
  report.value = null
  try {
    const parsed = await parseSpreadsheet(file)
    mappedRows.value = remap(parsed)
    if (!mappedRows.value.length) {
      errorMessage.value = 'Fichier vide ou en-têtes non reconnus.'
      return
    }
    await run(true)
  }
  catch {
    errorMessage.value = 'Impossible de lire le fichier.'
  }
}

const run = async (dryRun: boolean) => {
  loading.value = true
  errorMessage.value = ''
  try {
    report.value = await api<Report>(`/api/${props.endpoint}/import`, {
      method: 'POST',
      body: { rows: mappedRows.value, dryRun },
    })
    if (!dryRun) emit('imported')
  }
  catch {
    errorMessage.value = 'Échec de l\'import.'
  }
  finally {
    loading.value = false
  }
}

const template = () => downloadTemplate(props.fields.map(f => f.key), props.endpoint)
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-medium text-secondary-900">
          Importer — {{ label }}
        </h2>
        <button
          aria-label="Fermer"
          class="text-secondary-400 hover:text-secondary-700"
          @click="emit('close')"
        >
          <Icon
            name="lucide:x"
            class="size-5"
          />
        </button>
      </div>

      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700">
            <Icon
              name="lucide:upload"
              class="size-4"
            /> Choisir un fichier (CSV / ODS)
            <input
              type="file"
              accept=".csv,.ods,.xlsx"
              class="hidden"
              @change="onFile"
            >
          </label>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200 px-3 py-1.5 text-sm hover:bg-secondary-50"
            @click="template"
          >
            <Icon
              name="lucide:file-down"
              class="size-4"
            /> Modèle CSV
          </button>
          <span
            v-if="fileName"
            class="text-sm text-secondary-500"
          >{{ fileName }}</span>
        </div>

        <p class="text-xs text-secondary-500">
          En-têtes attendus (par clé ou libellé) — clé d'upsert : <code>{{ naturalKey }}</code>.
        </p>

        <p
          v-if="loading"
          class="text-sm text-secondary-500"
        >
          Analyse…
        </p>
        <p
          v-if="errorMessage"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ errorMessage }}
        </p>

        <div
          v-if="report"
          class="space-y-3 rounded-xl border border-secondary-200 p-4"
        >
          <div class="flex flex-wrap gap-4 text-sm">
            <span>Lignes : <strong>{{ report.total }}</strong></span>
            <span class="text-green-700">À créer : <strong>{{ report.created }}</strong></span>
            <span class="text-blue-700">À mettre à jour : <strong>{{ report.updated }}</strong></span>
            <span class="text-red-700">Erreurs : <strong>{{ report.errors.length }}</strong></span>
          </div>
          <div
            v-if="report.relatedCreated?.length"
            class="rounded-lg border border-primary-200/70 bg-primary-50/50 p-2.5 text-xs text-primary-800"
          >
            <div class="mb-1 font-medium">
              {{ report.dryRun ? 'Entités liées à créer' : 'Entités liées créées' }} ({{ report.relatedCreated.length }})
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="(r, i) in report.relatedCreated"
                :key="i"
                class="inline-flex items-center gap-1 rounded border border-primary-200 bg-white px-1.5 py-0.5"
              >
                <span class="text-primary-500">{{ r.label }}</span> {{ r.nom }}
              </span>
            </div>
          </div>
          <div
            v-if="report.errors.length"
            class="max-h-40 overflow-auto rounded-lg bg-red-50 p-2 text-xs text-red-700"
          >
            <div
              v-for="(err, i) in report.errors"
              :key="i"
            >
              Ligne {{ err.line }}<span v-if="err.cle"> ({{ err.cle }})</span> : {{ err.message }}
            </div>
          </div>
          <p
            v-if="report.dryRun"
            class="text-xs text-secondary-500"
          >
            Aperçu — rien n'a été écrit.
          </p>
          <p
            v-else
            class="text-sm font-medium text-green-700"
          >
            Import effectué.
          </p>
        </div>

        <div class="flex items-center justify-end gap-3 pt-2">
          <UIButton
            variant="secondary"
            @click="emit('close')"
          >
            Fermer
          </UIButton>
          <UIButton
            v-if="report?.dryRun && (report.created + report.updated) > 0"
            :disabled="loading"
            @click="run(false)"
          >
            Confirmer l'import ({{ report.created + report.updated }})
          </UIButton>
        </div>
      </div>
    </div>
  </div>
</template>
