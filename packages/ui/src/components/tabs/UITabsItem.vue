<script setup lang="ts">
import { computed, inject } from 'vue'
import { tabsContextKey } from './tabsContext'

const props = defineProps<{
    value: string
}>()

const tabsContext = inject(tabsContextKey, null)

const isActive = computed(() => tabsContext?.selectedValue.value === props.value)

const activeClass = computed(() => {
    const color = tabsContext?.color.value ?? 'neutral'
    const base = 'shadow'

    switch (color) {
        case 'primary':
            return 'bg-primary-600 text-white ' + base
        case 'secondary':
            return 'bg-secondary-400 text-white ' + base
        case 'accent':
            return 'bg-accent-300 text-white ' + base
        default:
            return 'bg-white text-gray-900 ' + base
    }
})

const handleSelect = () => {
    tabsContext?.select(props.value)
}
</script>

<template>
    <button
        class="px-3 py-1 rounded-lg transition-colors text-sm shrink-0 whitespace-nowrap"
        :class="isActive ? activeClass : 'text-gray-500'"
        type="button"
        @click="handleSelect"
    >
        <slot />
    </button>
</template>