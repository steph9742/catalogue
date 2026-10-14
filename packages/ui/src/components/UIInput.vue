<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
    inheritAttrs: false,
})

type UIInputSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
    id?: string
    name?: string
    type?: string
    label?: string
    placeholder?: string
    required?: boolean
    disabled?: boolean
    readonly?: boolean
    autocomplete?: string
    min?: string | number
    max?: string | number
    step?: string | number
    pattern?: string
    minLength?: number
    maxLength?: number
    helperText?: string
    error?: string
    size?: UIInputSize
}>(), {
    type: 'text',
    required: false,
    disabled: false,
    readonly: false,
    size: 'md',
})

const model = defineModel<string | number | null | undefined>()

const isNumericType = computed(() => props.type === 'number' || props.type === 'range')
const hasError = computed(() => Boolean(props.error))

const inputValue = computed({
    get: () => {
        if (model.value === null || model.value === undefined) {
            return ''
        }

        return String(model.value)
    },
    set: (value: string) => {
        if (isNumericType.value) {
            if (value === '') {
                model.value = undefined
                return
            }

            const parsed = Number(value)
            model.value = Number.isNaN(parsed) ? undefined : parsed
            return
        }

        model.value = value
    }
})

const sizeClasses: Record<UIInputSize, string> = {
    sm: 'h-9 text-sm px-3 rounded-md',
    md: 'h-10 text-sm px-3.5 rounded-lg',
    lg: 'h-11 text-base px-4 rounded-lg',
}

const inputClasses = computed(() => {
    const palette = hasError.value
        ? 'border-red-400 bg-red-50/40 text-red-900 placeholder:text-red-400 focus:ring-red-500/40 focus:border-red-500'
        : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-primary-500/30 focus:border-primary-500'

    return [
        'w-full border outline-none transition-colors duration-150',
        'focus:ring-2',
        'disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed',
        'read-only:bg-gray-50 read-only:text-gray-600',
        'font-sans',
        sizeClasses[props.size],
        palette,
    ]
})
</script>

<template>
    <div class="w-full space-y-1.5">
        <label v-if="label" :for="id" class="block text-sm font-mono font-medium tracking-tighter text-gray-800">
            {{ label }}
            <span v-if="required" class="ml-0.5 text-red-500">*</span>
        </label>

        <input
            v-bind="$attrs"
            :id="id"
            v-model="inputValue"
            :name="name"
            :type="type"
            :placeholder="placeholder"
            :required="required"
            :disabled="disabled"
            :readonly="readonly"
            :autocomplete="autocomplete"
            :min="min"
            :max="max"
            :step="step"
            :pattern="pattern"
            :minlength="minLength"
            :maxlength="maxLength"
            :aria-invalid="hasError ? 'true' : undefined"
            :class="inputClasses"
        >

        <p v-if="hasError" class="text-sm text-red-600 font-sans">
            {{ error }}
        </p>
        <p v-else-if="helperText" class="text-sm text-gray-500 font-sans">
            {{ helperText }}
        </p>
    </div>
</template>