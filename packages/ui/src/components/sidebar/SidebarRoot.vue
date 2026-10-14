<script setup lang="ts">
// Ossature « barre latérale + contenu », responsive. - À partir de `lg` : barre fixe et contenu
// décalé (comportement historique inchangé).
defineProps<{
    class?: string
    sidebarClass?: string
    contentClass?: string
    open?: boolean
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<!-- `overflow-x-clip` ET NON `overflow-x-hidden`. `hidden` fait de ce conteneur un CONTEXTE DE DÉFILEMENT : tout `position: sticky` en descendance colle alors à un bloc aussi haut que la page — donc ne colle jamais — et `window.scrollY` reste à zéro, ce qui prive les écouteurs de défilement de tout… -->
<template>
    <div :class="['min-h-svh bg-gray-100 overflow-x-clip p-2', $props.class]">
        <!-- Voile de fond : mobile uniquement, quand le tiroir est ouvert. -->
        <div
            v-if="open"
            class="fixed inset-0 z-30 bg-gray-900/30 lg:hidden"
            aria-hidden="true"
            @click="emit('update:open', false)"
        />

        <aside
            :class="[
                'fixed inset-y-0 left-0 z-40 flex max-h-svh w-80 max-w-[85vw] flex-col overflow-y-auto p-4 transition-transform duration-200 ease-out bg-gray-100 lg:bg-transparent',
                open ? 'translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full lg:translate-x-0',
                $props.sidebarClass,
            ]"
        >
            <slot name="sidebar" />
        </aside>

        <div class="flex w-full">
            <!-- Gouttière réservée à la barre latérale : uniquement quand elle est fixe. -->
            <div class="hidden w-78 shrink-0 lg:block" aria-hidden="true"></div>
            <main class="flex-1 min-w-0 max-w-full">
                <div :class="['bg-white rounded-xl shadow-sm min-h-[calc(100svh-1rem)]', $props.contentClass ?? 'p-4']">
                    <slot name="topbar" />
                    <slot name="rest" />
                </div>
            </main>
        </div>
    </div>
</template>
