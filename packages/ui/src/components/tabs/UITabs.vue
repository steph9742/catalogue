<script setup lang="ts">
import { computed, provide } from 'vue'
import { tabsContextKey } from './tabsContext'

const props = withDefaults(defineProps<{
    orientation?: 'horizontal' | 'vertical'
    color?: 'primary' | 'secondary' | 'accent' | 'neutral'
}>(), {
    orientation: 'horizontal',
    color: 'neutral'
})

const modelValue = defineModel<string>()
const selected = defineModel<string>('selected')

const selectedValue = computed<string>(() => modelValue.value ?? selected.value ?? '')

provide(tabsContextKey, {
    selectedValue,
    select: (value: string) => {
        modelValue.value = value
        selected.value = value
    },
    color: computed(() => props.color)
})
</script>

<template>
    <div :class="'flex p-2 gap-2 bg-gray-100 w-fit max-w-full rounded-lg font-sans tracking-tight' + (orientation === 'vertical' ? ' flex-col' : ' flex-wrap')">
        <slot />
    </div>
</template>