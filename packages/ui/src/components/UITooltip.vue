<script setup lang="ts">
import { useElementBounding, useTimeoutFn, useWindowSize } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

type TooltipOrientation = 'top' | 'bottom' | 'left' | 'right'

const props = withDefaults(defineProps<{
    delay?: number
    orientation?: TooltipOrientation
    content: string
}>(), {
    delay: 500,
    orientation: 'top'
})

const triggerRef = ref()
const tooltipRef = ref()
const isVisible = ref(false)
const currentOrientation = ref<TooltipOrientation>(props.orientation)

const fallbackByPreferred: Record<TooltipOrientation, TooltipOrientation[]> = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom']
}

const tooltipClass = computed(() => ({
    'bottom-full mb-2 left-1/2 -translate-x-1/2 before:top-full before:left-1/2 before:transform before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-gray-900': currentOrientation.value === 'top',
    'top-full mt-2 left-1/2 -translate-x-1/2 before:bottom-full before:left-1/2 before:transform before:-translate-x-1/2 before:border-4 before:border-transparent before:border-b-gray-900': currentOrientation.value === 'bottom',
    'right-full mr-2 top-1/2 -translate-y-1/2 before:left-full before:top-1/2 before:transform before:-translate-y-1/2 before:border-4 before:border-transparent before:border-l-gray-900': currentOrientation.value === 'left',
    'left-full ml-2 top-1/2 -translate-y-1/2 before:right-full before:top-1/2 before:transform before:-translate-y-1/2 before:border-4 before:border-transparent before:border-r-gray-900': currentOrientation.value === 'right'
}))

const triggerBounds = useElementBounding(triggerRef)
const tooltipBounds = useElementBounding(tooltipRef)
const { width: windowWidth, height: windowHeight } = useWindowSize()

function chooseOrientation() {
    if (!triggerRef.value || !tooltipRef.value) {
        currentOrientation.value = props.orientation
        return
    }

    const gap = 12
    const margin = 8

    const fits: Record<TooltipOrientation, boolean> = {
        top: triggerBounds.top.value >= tooltipBounds.height.value + gap + margin,
        bottom: windowHeight.value - triggerBounds.bottom.value >= tooltipBounds.height.value + gap + margin,
        left: triggerBounds.left.value >= tooltipBounds.width.value + gap + margin,
        right: windowWidth.value - triggerBounds.right.value >= tooltipBounds.width.value + gap + margin
    }

    const preferredOrder = fallbackByPreferred[props.orientation]
    currentOrientation.value = preferredOrder.find((candidate) => fits[candidate]) ?? props.orientation
}

const { start: startShowDelay, stop: stopShowDelay } = useTimeoutFn(async () => {
        isVisible.value = true
        await nextTick()
        triggerBounds.update()
        tooltipBounds.update()
        chooseOrientation()
}, computed(() => props.delay), { immediate: false })

function showTooltip() {
    stopShowDelay()
    startShowDelay()
}

function hideTooltip() {
    stopShowDelay()
    isVisible.value = false
}

watch(() => props.orientation, (newOrientation) => {
    currentOrientation.value = newOrientation
    if (isVisible.value) {
        chooseOrientation()
    }
})

watch(
    [
        windowWidth,
        windowHeight,
        triggerBounds.top,
        triggerBounds.bottom,
        triggerBounds.left,
        triggerBounds.right,
        tooltipBounds.width,
        tooltipBounds.height,
        isVisible
    ],
    () => {
        if (isVisible.value) {
            chooseOrientation()
        }
    }
)

watch(() => triggerRef.value, () => {
    if (isVisible.value) {
        triggerBounds.update()
        tooltipBounds.update()
        chooseOrientation()
    }
})
watch(() => tooltipRef.value, () => {
    if (isVisible.value) {
        triggerBounds.update()
        tooltipBounds.update()
        chooseOrientation()
    }
})
</script>

<template>
    <div
        ref="triggerRef"
        class="relative inline-block font-sans tracking-tight text-xs"
        @mouseenter="showTooltip"
        @mouseleave="hideTooltip"
        @focusin="showTooltip"
        @focusout="hideTooltip"
    >
        <Transition
            enter-active-class="transition duration-80 ease-out"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
        >
            <div
                v-if="isVisible"
                ref="tooltipRef"
                role="tooltip"
                class="absolute bg-gray-900 text-white rounded px-2 py-1 whitespace-nowrap z-50 before:content-[\` \`] before:absolute"
                :class="tooltipClass"
            >
                <span>{{ content }}</span>
            </div>
        </Transition>
        <slot />
    </div>
</template>