<script setup lang="ts">
// Barre supérieure : ouvre le menu sur mobile (le tiroir latéral) et donne un accès TOUJOURS
// VISIBLE à la recherche — au doigt comme au clavier.
defineProps<{ titre?: string }>()
const emit = defineEmits<{ menu: [], recherche: [] }>()
</script>

<template>
  <!-- COLLANTE : la recherche globale doit rester atteignable au milieu d'une liste
       de plusieurs milliers de lignes. Fond opaque, sinon le contenu défile au travers. -->
  <!-- Les marges négatives tiraient un bandeau teinté jusqu'aux bords du cadre, à angles droits contre des coins arrondis. -->
  <div class="sticky top-0 z-30 -mt-1 mb-3 flex items-center gap-2 border-b border-secondary-200/60 bg-white/90 py-2 backdrop-blur lg:justify-end">
    <!-- Menu (mobile / tablette) : cible tactile confortable. -->
    <button
      class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-secondary-200/80 text-secondary-700 transition-colors hover:bg-secondary-50 lg:hidden"
      aria-label="Ouvrir le menu"
      @click="emit('menu')"
    >
      <Icon
        name="lucide:menu"
        class="size-5"
      />
    </button>

    <span class="min-w-0 flex-1 truncate font-semibold tracking-tight text-secondary-900 lg:hidden">{{ titre ?? 'Catalogue' }}</span>

    <!-- Recherche globale. Bouton visible, jamais seulement au clavier. -->
    <button
      class="hidden h-11 shrink-0 items-center gap-2 rounded-xl border border-secondary-200/80 px-3 text-sm text-secondary-500 transition-colors hover:bg-secondary-50 hover:text-secondary-700 lg:inline-flex"
      aria-label="Recherche globale"
      @click="emit('recherche')"
    >
      <Icon
        name="lucide:search"
        class="size-4"
      />
      <span>Recherche globale</span>
      <kbd class="ml-2 hidden rounded border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 font-mono text-[10px] text-secondary-400 lg:inline">⌘K</kbd>
    </button>
  </div>
</template>
