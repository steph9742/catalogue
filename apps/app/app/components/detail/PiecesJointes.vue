<script setup lang="ts">
import DetailSection from '~/components/detail/DetailSection.vue'

// Pièces jointes d'une entité — composant générique, réutilisable sur n'importe quelle
// fiche : il suffit de passer la clé du catalogue et l'id.
const props = withDefaults(defineProps<{
  typeSource: string
  sourceId: string
  editable: boolean
  titre?: string
}>(), { titre: 'Pièces jointes' })

const TAILLE_MAX = 20 * 1024 * 1024

type Piece = {
  id: string
  nom: string
  mimeType: string | null
  taille: number
  description: string | null
  createdAt: string
  deposePar: string | null
}

const api = useApi()
const config = useRuntimeConfig()
const { data: pieces, refresh } = await useAsyncData(
  `pj-${props.typeSource}-${props.sourceId}`,
  () => api<Piece[]>(`/api/pieces-jointes/source/${props.typeSource}/${props.sourceId}`),
  { getCachedData: () => undefined },
)

const poids = (o: number) =>
  o < 1024 ? `${o} o` : o < 1024 * 1024 ? `${(o / 1024).toFixed(0)} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`

const ICONE = (mime: string | null, nom: string) => {
  const ext = nom.split('.').pop()?.toLowerCase() ?? ''
  if (mime?.startsWith('image/')) return 'lucide:image'
  if (mime === 'application/pdf' || ext === 'pdf') return 'lucide:file-text'
  if (['xlsx', 'xls', 'ods', 'csv'].includes(ext)) return 'lucide:table'
  if (['docx', 'doc', 'odt'].includes(ext)) return 'lucide:file-type'
  if (['zip', 'gz', '7z', 'tar'].includes(ext)) return 'lucide:file-archive'
  return 'lucide:paperclip'
}

const fileInput = ref<HTMLInputElement>()
const description = ref('')
const busy = ref(false)
const erreur = ref('')

const deposer = async (e: Event) => {
  const cible = e.target as HTMLInputElement
  const fichier = cible.files?.[0]
  if (!fichier) return
  erreur.value = ''
  // Contrôle côté client pour éviter un aller-retour inutile ; le serveur revérifie.
  if (fichier.size > TAILLE_MAX) {
    erreur.value = `« ${fichier.name} » fait ${poids(fichier.size)} — la limite est de 20 Mo.`
    cible.value = ''
    return
  }
  const form = new FormData()
  form.append('fichier', fichier)
  if (description.value.trim()) form.append('description', description.value.trim())

  busy.value = true
  try {
    await api(`/api/pieces-jointes/source/${props.typeSource}/${props.sourceId}`, { method: 'POST', body: form })
    description.value = ''
    await refresh()
  }
  catch {
    erreur.value = `Échec du dépôt de « ${fichier.name} ».`
  }
  finally {
    busy.value = false
    cible.value = ''
  }
}

// Le téléchargement passe par une URL directe (le cookie de session part avec) plutôt
// que par un fetch + Blob : le navigateur gère la sauvegarde nativement.
const lienTelechargement = (id: string) =>
  `${config.public.serverBaseUrl}/api/pieces-jointes/${id}/contenu`

const supprimer = async (p: Piece) => {
  if (!confirm(`Supprimer la pièce jointe « ${p.nom} » ?`)) return
  await api(`/api/pieces-jointes/${p.id}`, { method: 'DELETE' })
  await refresh()
}

const CHAMP = 'rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <DetailSection
    :title="titre"
    icon="lucide:paperclip"
  >
    <div
      v-if="pieces?.length"
      class="space-y-1"
    >
      <div
        v-for="p in pieces"
        :key="p.id"
        class="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary-50"
      >
        <Icon
          :name="ICONE(p.mimeType, p.nom)"
          class="size-4 shrink-0 text-primary-500"
        />
        <a
          :href="lienTelechargement(p.id)"
          class="text-sm text-secondary-800 hover:text-primary-700 hover:underline"
          :title="p.description || 'Télécharger'"
        >{{ p.nom }}</a>
        <span class="font-mono text-[10px] uppercase tracking-wide text-secondary-400">{{ poids(p.taille) }}</span>
        <span
          v-if="p.description"
          class="text-xs text-secondary-500"
        >— {{ p.description }}</span>
        <span class="ml-auto flex items-center gap-2">
          <span
            v-if="p.deposePar"
            class="font-mono text-[10px] uppercase tracking-wide text-secondary-400"
          >{{ p.deposePar }}</span>
          <button
            v-if="editable"
            aria-label="Supprimer"
            class="rounded p-0.5 text-secondary-300 transition-colors hover:bg-secondary-100 hover:text-red-600"
            @click="supprimer(p)"
          >
            <Icon
              name="lucide:x"
              class="size-3.5"
            />
          </button>
        </span>
      </div>
    </div>
    <p
      v-else
      class="text-sm text-secondary-400"
    >
      Aucune pièce jointe.
    </p>

    <div
      v-if="editable"
      class="space-y-2 border-t border-secondary-100 pt-3"
    >
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Description (optionnelle)</span>
          <input
            v-model="description"
            placeholder="ex. Politique signée par la direction"
            :class="[CHAMP, 'w-72']"
          >
        </label>
        <button
          :disabled="busy"
          class="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          @click="fileInput?.click()"
        >
          <Icon
            :name="busy ? 'lucide:loader-circle' : 'lucide:upload'"
            class="size-4"
            :class="busy ? 'animate-spin' : ''"
          />
          {{ busy ? 'Dépôt en cours…' : 'Déposer un fichier' }}
        </button>
        <span class="font-mono text-[10px] uppercase tracking-wide text-secondary-400">20 Mo max</span>
      </div>
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        @change="deposer"
      >
      <p
        v-if="erreur"
        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ erreur }}
      </p>
    </div>
  </DetailSection>
</template>
