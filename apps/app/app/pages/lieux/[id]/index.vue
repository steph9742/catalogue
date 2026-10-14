<script setup lang="ts">
// Fiche Lieux = PAGE PIVOT : on y lit le SI par périmètre, pas par type d'objet.
// Toute la mécanique est dans <PerimetrePivot> (partagée par les quatre axes).
import PerimetrePivot from '~/components/PerimetrePivot.vue'

const route = useRoute()
const perms = await usePermissions()
if (!perms.canRead('lieux')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

const id = computed(() => String(route.params.id))
const editable = computed(() => perms.canWrite('lieux'))
</script>

<template>
  <PerimetrePivot
    :id="id"
    type="lieu"
    :retour="{ label: 'Lieux', url: '/lieux' }"
    :editable="editable"
  />
</template>
