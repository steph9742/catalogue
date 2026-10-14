<script setup lang="ts">
import { SidebarRoot, ToastProvider } from '@catalogue/ui'
import USidebar from '~/components/sidebar/USidebar.vue'
import AppTopBar from '~/components/AppTopBar.vue'
import CommandPalette from '~/components/CommandPalette.vue'

// Le tiroir latéral (mobile) et la palette de recherche sont pilotés ici : la barre
// supérieure les ouvre, et le tiroir se referme automatiquement à chaque navigation.
const menuOuvert = ref(false)
// État partagé : la palette s'ouvre depuis la barre latérale, la barre supérieure ou le
// clavier — aucun de ces chemins n'est indispensable aux autres.
const { ouverte: rechercheOuverte, ouvrir: ouvrirRecherche } = useRecherche()
const route = useRoute()
watch(() => route.fullPath, () => {
  menuOuvert.value = false
})
</script>

<template>
  <!-- LA FIN DE PAGE RESTE ATTEIGNABLE SOUS `lg`. Le bouton flottant de recherche est posé à 20 px du bas, sur 56 px : sans cette réserve, il couvre la dernière ligne d'une liste ou le dernier bouton d'un formulaire, et la page paraît bloquée alors qu'elle est simplement finie sous le bouton. -->
  <SidebarRoot
    v-model:open="menuOuvert"
    content-class="p-3 pb-24 sm:p-4 sm:pb-24 lg:pb-4"
  >
    <template #sidebar>
      <USidebar />
    </template>
    <template #topbar>
      <AppTopBar
        @menu="menuOuvert = true"
        @recherche="ouvrirRecherche()"
      />
    </template>
    <template #rest>
      <slot />
    </template>
  </SidebarRoot>
  <!-- RECHERCHE GLOBALE SUR MOBILE : bouton flottant, pas barre collante.
       Une barre collante coûterait de la hauteur en permanence sur un écran de 375 px,
       là où le flottant n'en consomme aucune et tombe sous le pouce. Masqué à partir de
       `lg`, où la barre du haut collante prend le relais.
       eslint-disable-next-line vue/no-multiple-template-root -->
  <button
    class="fixed bottom-5 right-5 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30 transition-transform active:scale-95 lg:hidden"
    aria-label="Recherche globale"
    @click="ouvrirRecherche()"
  >
    <Icon
      name="lucide:search"
      class="size-6"
    />
  </button>
  <!-- eslint-disable-next-line vue/no-multiple-template-root -->
  <CommandPalette v-model:open="rechercheOuverte" />
  <!-- eslint-disable-next-line vue/no-multiple-template-root -->
  <ToastProvider />
</template>
