<script setup lang="ts">
import UIButton from '../UIButton.vue';
import type { Toast } from './useToast'
import { useToast } from './useToast';

const props = defineProps<Toast>()

// L'action referme le bandeau AVANT de s'exécuter : laisser un bouton « Annuler » cliquable
// une seconde fois pendant que l'annulation est en cours produirait un double effet.
const lancerAction = async () => {
    useToast().clearToast(props.id)
    await props.action?.run()
}

const typeClasses = {
    neutral: 'bg-white text-text border-gray-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
}
</script>

<template>
    <li :class="[typeClasses[type], 'p-3 rounded-md border shadow-sm min-w-xs']">
        <div class="relative">
            <div class="inline-flex items-center gap-2">
                <Icon
                    v-if="icon"
                    :name="icon"
                    class="size-4"
                />
                <p class="font-sans tracking-tight font-bold" v-if="title">{{ title }}</p>
            </div>
            <UIButton
                size="icon"
                variant="ghost"
                class="absolute -top-1.5 -right-2 opacity-50 hover:opacity-100 transition-opacity"
                @click="useToast().clearToast(id)"
            >
                <Icon name="lucide:x" class="size-4" />
            </UIButton>
        </div>
        <div :class="['font-sans tracking-tight', icon ? 'ml-6' : '']" >
            <p v-if="message">{{ message }}</p>
            <button
                v-if="action"
                type="button"
                class="mt-2 rounded-md border border-current/25 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-white/60"
                @click="lancerAction()"
            >
                {{ action.label }}
            </button>
        </div>
    </li>
</template>