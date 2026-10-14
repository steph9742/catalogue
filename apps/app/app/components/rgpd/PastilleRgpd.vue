<script setup lang="ts">
// PASTILLES RGPD sur une application. Quatre états, et c'est la distinction entre les deux
// premiers qui fait tout l'intérêt du dispositif : hors périmètre : l'application ne traite pas
// de données personnelles → RIEN.
const props = defineProps<{
  etat?: 'hors_perimetre' | 'non_evalue' | 'ecart' | 'conforme' | null
  ecarts?: number | null
  evaluees?: number | null
  total?: number | null
  aipdStatut?: string | null
  aipdConclusion?: string | null
  compact?: boolean
}>()

const BASE = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold'

const rgpd = computed(() => {
  switch (props.etat) {
    case 'ecart':
      return {
        cls: 'border-red-200 bg-red-50 text-red-700',
        icone: 'lucide:triangle-alert',
        texte: 'RGPD',
        aide: `${props.ecarts ?? 0} exigence(s) de sécurité du RGPD non conforme(s) sur ce traitement.`,
      }
    case 'conforme':
      return {
        cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        icone: 'lucide:check',
        texte: 'RGPD',
        aide: `Les ${props.total ?? 0} exigences applicables ont été évaluées, aucun écart.`,
      }
    case 'non_evalue':
      return {
        cls: 'border-secondary-200 bg-secondary-50 text-secondary-500',
        icone: 'lucide:circle-dashed',
        texte: 'RGPD',
        aide: `Traitement de données personnelles non évalué : ${props.evaluees ?? 0} exigence(s) renseignée(s) sur ${props.total ?? 0}.`,
      }
    default:
      // hors périmètre : rien du tout.
      return null
  }
})

// L'analyse d'impact conclue à un risque résiduel élevé impose de consulter la CNIL AVANT
// de traiter (art. 36). Ce cas ne peut pas porter la même pastille qu'une analyse sereine.
const aipd = computed(() => {
  if (!props.aipdStatut || props.aipdStatut === 'non_requise') return null
  if (props.aipdConclusion === 'risque_eleve_consultation') {
    return {
      cls: 'border-red-300 bg-red-100 text-red-800',
      icone: 'lucide:octagon-alert',
      texte: 'AIPD — CNIL',
      aide: 'Analyse d\'impact concluant à un risque résiduel élevé : l\'article 36 impose de consulter la CNIL avant la mise en œuvre du traitement.',
    }
  }
  const libelles: Record<string, string> = {
    a_faire: 'AIPD à faire',
    en_cours: 'AIPD en cours',
    terminee: 'AIPD',
  }
  return {
    cls: props.aipdStatut === 'terminee'
      ? 'border-primary-200 bg-primary-50 text-primary-700'
      : 'border-amber-200 bg-amber-50 text-amber-700',
    icone: 'lucide:file-search',
    texte: libelles[props.aipdStatut] ?? 'AIPD',
    aide: 'Analyse d\'impact relative à la protection des données (art. 35) — ces traitements sont généralement les plus sensibles du parc.',
  }
})
</script>

<template>
  <span
    v-if="rgpd || aipd"
    class="inline-flex flex-wrap items-center gap-1"
  >
    <span
      v-if="rgpd"
      :class="[BASE, rgpd.cls]"
      :title="rgpd.aide"
    >
      <Icon
        :name="rgpd.icone"
        class="size-3"
      />
      <span v-if="!compact">{{ rgpd.texte }}</span>
    </span>
    <span
      v-if="aipd"
      :class="[BASE, aipd.cls]"
      :title="aipd.aide"
    >
      <Icon
        :name="aipd.icone"
        class="size-3"
      />
      <span v-if="!compact">{{ aipd.texte }}</span>
    </span>
  </span>
</template>
