<!-- eslint-disable vue/require-toggle-inside-transition -->
<script setup lang="ts">
import UIButton from './UIButton.vue';

withDefaults(defineProps<{
    title: string
    description?: string
    dismissable?: boolean
    fullscreen?: boolean
}>(), {
    dismissable: true,
    fullscreen: false,
})

const emit = defineEmits(['close'])

const close = () => {
    emit('close')
    model.value = false
}

const model = defineModel<boolean>()
</script>

<template>
    <Teleport to="body">
        <Transition name="dialog-bg">
            <div v-if="model" class="inset-0 fixed z-50 w-full h-full bg-black/40 flex items-end justify-center sm:items-center">
                <Transition name="dialog-content">
                    <!-- Colonne : en-tête et pied restent en place, seul le contenu défile. Une modale plus haute que la fenêtre débordait sans ascenseur, et ses boutons d'action devenaient inatteignables. -->
                    <div
                        v-if="model"
                        :class="[
                        'bg-white relative z-60 border border-gray-200 flex flex-col',
                        fullscreen
                            ? 'w-full h-full rounded-none'
                            : 'w-full rounded-t-2xl max-h-[90dvh] sm:w-xl sm:max-w-xl sm:rounded-lg'
                    ]">
                        <header class="flex justify-between items-start gap-4 shrink-0 p-4 pb-0">
                            <div>
                                <h2 class="text-lg font-semibold font-mono tracking-tighter">{{ title }}</h2>
                                <p v-if="description" class="text-sm text-gray-500 mt-px font-sans">{{ description }}</p>
                            </div>
                            <UIButton v-if="dismissable" variant="ghost" size="icon" @click="close">
                                <Icon name="lucide:x" />
                            </UIButton>
                        </header>
                        <div class="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-5 font-sans">
                            <slot name="content" />
                        </div>
                        <div class="flex items-center justify-end gap-2.5 shrink-0 p-4 pt-0">
                            <slot name="footer" />
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.dialog-bg-enter-active, .dialog-bg-leave-active {
    transition: opacity 0.2s ease;
}

.dialog-bg-enter-from, .dialog-bg-leave-to {
    opacity: 0;
}

.dialog-content-enter-active {
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dialog-content-leave-active {
    transition: all 0.2s ease-in;
}

.dialog-content-enter-from, .dialog-content-leave-to {
    opacity: 0;
    transform: scale(0.85);
}
</style>