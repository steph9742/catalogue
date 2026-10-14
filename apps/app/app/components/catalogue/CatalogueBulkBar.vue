<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from '@catalogue/ui'
import type { CatalogueConfig } from '~/utils/catalogues'

// ACTIONS GROUPÉES — modifier ou supprimer une sélection d'un seul geste.

const props = defineProps<{
  config: CatalogueConfig
  ids: string[]
  apercu: string[] // quelques noms, pour que la confirmation soit parlante
  champsModifiables: { key: string, label: string, options: { value: string, label: string }[] }[]
  supprimable: boolean
  // Filtre courant (recherche + critères), tel que la liste l'envoie au serveur.
  filtre: Record<string, string>
  // Nombre total de résultats du filtre — au-delà de la page affichée.
  totalFiltre: number
}>()
const emit = defineEmits<{ termine: [], vider: [] }>()

const api = useApi()
const { newToast } = useToast()

const enCours = ref(false)
const champ = ref('')
const valeur = ref('')
const confirmation = ref<'modifier' | 'supprimer' | null>(null)

// Portée de l'action : la sélection cochée, ou TOUS les résultats du filtre.
const portee = ref<'selection' | 'filtre'>('selection')
const nb = computed(() => (portee.value === 'filtre' ? props.totalFiltre : props.ids.length))
// Corps de requête : soit les identifiants cochés, soit le filtre que le serveur résoudra
// avec la MÊME fonction que la liste (aucune divergence possible).
const designation = computed(() => (portee.value === 'filtre' ? { filtre: props.filtre } : { ids: props.ids }))

// Repasse en mode « sélection » dès que la sélection change : garder une portée élargie
// après avoir décoché serait le meilleur moyen d'agir par erreur sur tout le catalogue.
watch(() => props.ids, () => {
  portee.value = 'selection'
})
const champActif = computed(() => props.champsModifiables.find(c => c.key === champ.value))
const libelleValeur = computed(() => champActif.value?.options.find(o => o.value === valeur.value)?.label ?? valeur.value)

// Au-delà de ce seuil, l'action est présentée comme lourde : le libellé du bouton de
// confirmation reprend le compte, pour qu'on ne valide pas machinalement.
const AMPLEUR = 25
const lourde = computed(() => nb.value >= AMPLEUR)

const modifier = async () => {
  if (!champ.value || enCours.value) return
  enCours.value = true
  try {
    const r = await api<{ modifiees: number, annulationId: string | null }>(
      `/api/${props.config.endpoint}/lot`,
      { method: 'PATCH', body: { ...designation.value, valeurs: { [champ.value]: valeur.value || null } } },
    )
    newToast({
      type: 'success',
      title: `${r.modifiees} ${props.config.label.toLowerCase()} modifié${r.modifiees > 1 ? 's' : ''}`,
      message: `${champActif.value?.label} → ${libelleValeur.value || '(vide)'}`,
      icon: 'lucide:check-circle-2',
      action: {
        label: 'Annuler',
        run: async () => {
          if (!r.annulationId) return
          await api(`/api/${props.config.endpoint}/lot/annuler/${r.annulationId}`, { method: 'POST' })
          newToast({ type: 'info', title: 'Modification annulée', icon: 'lucide:undo-2' })
          emit('termine')
        },
      },
    })
    confirmation.value = null
    champ.value = ''
    valeur.value = ''
    emit('termine')
  }
  catch {
    newToast({ type: 'error', title: 'La modification groupée a échoué', icon: 'lucide:alert-circle' })
  }
  finally { enCours.value = false }
}

const supprimer = async () => {
  if (enCours.value) return
  enCours.value = true
  try {
    const r = await api<{ supprimees: number, annulationId: string | null }>(
      `/api/${props.config.endpoint}/lot`,
      { method: 'DELETE', body: designation.value },
    )
    newToast({
      type: 'success',
      title: `${r.supprimees} ${props.config.label.toLowerCase()} supprimé${r.supprimees > 1 ? 's' : ''}`,
      message: 'Annulable pendant quelques secondes.',
      icon: 'lucide:trash-2',
      action: {
        label: 'Annuler',
        run: async () => {
          if (!r.annulationId) return
          await api(`/api/${props.config.endpoint}/lot/annuler/${r.annulationId}`, { method: 'POST' })
          newToast({ type: 'info', title: 'Suppression annulée', icon: 'lucide:undo-2' })
          emit('termine')
        },
      },
    })
    confirmation.value = null
    emit('termine')
  }
  catch {
    newToast({ type: 'error', title: 'La suppression groupée a échoué', icon: 'lucide:alert-circle' })
  }
  finally { enCours.value = false }
}
</script>

<template>
  <div class="sticky bottom-3 z-30 rounded-2xl border border-primary-200 bg-white/95 p-3 shadow-lg backdrop-blur">
    <div class="flex flex-wrap items-center gap-3">
      <span
        class="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
        :class="portee === 'filtre' ? 'bg-amber-100 text-amber-800' : 'bg-primary-50 text-primary-700'"
      >
        <Icon
          :name="portee === 'filtre' ? 'lucide:alert-triangle' : 'lucide:check-square'"
          class="size-4"
        />
        <template v-if="portee === 'filtre'">{{ totalFiltre }} résultat{{ totalFiltre > 1 ? 's' : '' }} du filtre</template>
        <template v-else>{{ ids.length }} sélectionné{{ ids.length > 1 ? 's' : '' }}</template>
      </span>

      <div
        v-if="champsModifiables.length"
        class="flex flex-wrap items-center gap-2"
      >
        <select
          v-model="champ"
          class="rounded-lg border border-secondary-200 px-2.5 py-1.5 text-sm"
        >
          <option value="">
            Modifier le champ…
          </option>
          <option
            v-for="c in champsModifiables"
            :key="c.key"
            :value="c.key"
          >
            {{ c.label }}
          </option>
        </select>
        <select
          v-if="champActif"
          v-model="valeur"
          class="rounded-lg border border-secondary-200 px-2.5 py-1.5 text-sm"
        >
          <option value="">
            — vider —
          </option>
          <option
            v-for="o in champActif.options"
            :key="String(o.value)"
            :value="o.value"
          >
            {{ o.label }}
          </option>
        </select>
        <button
          v-if="champ"
          class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          :disabled="enCours"
          @click="confirmation = 'modifier'"
        >
          Appliquer
        </button>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <button
          v-if="supprimable"
          class="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
          :disabled="enCours"
          @click="confirmation = 'supprimer'"
        >
          <Icon
            name="lucide:trash-2"
            class="size-4"
          /> Supprimer
        </button>
        <button
          class="rounded-lg px-3 py-1.5 text-sm text-secondary-600 transition-colors hover:bg-secondary-50"
          @click="emit('vider')"
        >
          Désélectionner
        </button>
      </div>
    </div>

    <!-- Élargir la portée : proposé UNIQUEMENT quand la page ne couvre pas tout le
         filtre, et présenté comme une décision distincte (l'option « nucléaire »). -->
    <p
      v-if="totalFiltre > ids.length"
      class="mt-2 border-t border-secondary-100 pt-2 text-xs text-secondary-600"
    >
      <template v-if="portee === 'selection'">
        Seules les {{ ids.length }} lignes cochées seront touchées.
        <button
          class="font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800"
          @click="portee = 'filtre'"
        >
          Sélectionner les {{ totalFiltre }} résultats du filtre
        </button>
      </template>
      <template v-else>
        <Icon
          name="lucide:alert-triangle"
          class="mr-1 inline size-3.5 text-amber-600"
        />
        L'action portera sur <strong>les {{ totalFiltre }} résultats du filtre</strong>, y compris ceux qui ne sont pas affichés.
        <button
          class="font-semibold text-secondary-700 underline underline-offset-2"
          @click="portee = 'selection'"
        >
          Revenir aux {{ ids.length }} lignes cochées
        </button>
      </template>
    </p>

    <!-- Confirmation PROPORTIONNÉE : elle décrit l'ampleur et donne à voir des exemples. -->
    <div
      v-if="confirmation"
      class="mt-3 rounded-xl border p-3"
      :class="confirmation === 'supprimer' ? 'border-red-200 bg-red-50/70' : 'border-amber-200 bg-amber-50/70'"
    >
      <p
        class="text-sm font-medium"
        :class="confirmation === 'supprimer' ? 'text-red-800' : 'text-amber-900'"
      >
        <template v-if="confirmation === 'supprimer'">
          Supprimer {{ nb }} {{ config.label.toLowerCase() }}{{ lourde ? ' — action de grande ampleur' : '' }}
        </template>
        <template v-else>
          Modifier {{ champActif?.label }} sur {{ nb }} {{ config.label.toLowerCase() }} → « {{ libelleValeur || 'vide' }} »
        </template>
      </p>
      <p
        class="mt-1 text-xs"
        :class="confirmation === 'supprimer' ? 'text-red-700' : 'text-amber-800'"
      >
        <template v-if="portee === 'filtre'">
          Toutes les lignes correspondant au filtre courant sont concernées, <strong>y compris celles que vous n'avez pas à l'écran</strong>.
        </template>
        <template v-else>
          Par exemple : {{ apercu.slice(0, 3).join(', ') }}<span v-if="nb > 3"> et {{ nb - 3 }} autre{{ nb - 3 > 1 ? 's' : '' }}</span>.
        </template>
        <span v-if="confirmation === 'supprimer'"> Les pièces jointes associées seront supprimées également.</span>
        <span v-if="lourde"> L'action reste annulable pendant 24 h.</span>
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
          :class="confirmation === 'supprimer' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'"
          :disabled="enCours"
          @click="confirmation === 'supprimer' ? supprimer() : modifier()"
        >
          {{ enCours ? 'En cours…' : (confirmation === 'supprimer' ? `Supprimer les ${nb}` : `Modifier les ${nb}`) }}
        </button>
        <button
          class="rounded-lg border border-secondary-200 px-3 py-1.5 text-sm text-secondary-700 transition-colors hover:bg-white"
          @click="confirmation = null"
        >
          Renoncer
        </button>
      </div>
    </div>
  </div>
</template>
