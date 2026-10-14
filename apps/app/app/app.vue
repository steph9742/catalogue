<script setup lang="ts">
// LE TITRE DE L'ONGLET. Sans lui, le navigateur affiche l'adresse brute — « catalogue…
// /audit-surface/domaines » — dans l'onglet, l'historique et les favoris.
const route = useRoute()
useHead({
  title: computed(() => titreDeRoute(route.path)),
  titleTemplate: titre => (titre ? `${titre} — Catalogue` : 'Catalogue'),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
