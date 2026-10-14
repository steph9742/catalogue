<script setup lang="ts">
import { computed } from 'vue';
import UIToast from './UIToast.vue';
import { useToast } from './useToast';

const props = withDefaults(defineProps<{
    orientation?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    enterDirection?: 'left' | 'right'
}>(), {
    orientation: 'top-right',
    enterDirection: 'right',
})

const orientationClass = computed(() => {
    switch (props.orientation) {
        case 'top-left':
            return 'top-4 left-4'
        case 'top-right':
            return 'top-4 right-4'
        case 'bottom-left':
            return 'bottom-4 left-4'
        case 'bottom-right':
            return 'bottom-4 right-4'
        default:
            return 'top-4 right-4'
    }
})

const enterDirectionClass = computed(() => {
    switch (props.enterDirection) {
        case 'left':
            return 'translateX(-100%)'
        case 'right':
            return 'translateX(100%)'
        default:
            return 'translateX(100%)'
    }
})

const { toasts } = useToast()

</script>

<template>
    <Teleport to="body">
        <div :class="[orientationClass, 'fixed z-50 flex flex-col gap-2']">
            <TransitionGroup
                name="toast"
                tag="ol"
                class="flex flex-col gap-2"
            >
                <UIToast
                    v-for="toast in toasts"
                    :key="toast.id"
                    :id="toast.id"
                    :title="toast.title"
                    :message="toast.message"
                    :icon="toast.icon"
                    :type="toast.type"
                    :action="toast.action"
                />
            </TransitionGroup>
        </div>
    </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
    transition: all 0.1s ease;
}

.toast-enter-from,
.toast-leave-to {
    opacity: 0;
    transform: v-bind(enterDirectionClass);
}
</style>