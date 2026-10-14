<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
	inheritAttrs: false,
})

type UITextAreaSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
	id?: string
	name?: string
	label?: string
	placeholder?: string
	required?: boolean
	disabled?: boolean
	readonly?: boolean
	autocomplete?: string
	rows?: number
	minLength?: number
	maxLength?: number
	helperText?: string
	error?: string
	resize?: 'none' | 'both' | 'horizontal' | 'vertical'
	size?: UITextAreaSize
}>(), {
	required: false,
	disabled: false,
	readonly: false,
	rows: 4,
	resize: 'vertical',
	size: 'md',
})

const model = defineModel<string | null | undefined>()

const hasError = computed(() => Boolean(props.error))

const textareaValue = computed({
	get: () => {
		if (model.value === null || model.value === undefined) {
			return ''
		}

		return model.value
	},
	set: (value: string) => {
		model.value = value
	}
})

const sizeClasses: Record<UITextAreaSize, string> = {
	sm: 'text-sm px-3 py-2 rounded-md',
	md: 'text-sm px-3.5 py-2.5 rounded-lg',
	lg: 'text-base px-4 py-3 rounded-lg',
}

const resizeClasses: Record<NonNullable<typeof props.resize>, string> = {
	none: 'resize-none',
	both: 'resize',
	horizontal: 'resize-x',
	vertical: 'resize-y',
}

const textareaClasses = computed(() => {
	const palette = hasError.value
		? 'border-red-400 bg-red-50/40 text-red-900 placeholder:text-red-400 focus:ring-red-500/40 focus:border-red-500'
		: 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-primary-500/30 focus:border-primary-500'

	return [
		'w-full border outline-none transition-colors duration-150 leading-relaxed',
		'focus:ring-2',
		'disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed',
		'read-only:bg-gray-50 read-only:text-gray-600',
		'font-sans',
		sizeClasses[props.size],
		resizeClasses[props.resize],
		palette,
	]
})
</script>

<template>
	<div class="w-full space-y-1.5">
		<label v-if="label" :for="id" class="block text-sm font-mono font-medium tracking-tight text-gray-800">
			{{ label }}
			<span v-if="required" class="ml-0.5 text-red-500">*</span>
		</label>

		<textarea
			v-bind="$attrs"
			:id="id"
			v-model="textareaValue"
			:name="name"
			:placeholder="placeholder"
			:required="required"
			:disabled="disabled"
			:readonly="readonly"
			:autocomplete="autocomplete"
			:rows="rows"
			:minlength="minLength"
			:maxlength="maxLength"
			:aria-invalid="hasError ? 'true' : undefined"
			:class="textareaClasses"
		/>

		<p v-if="hasError" class="text-sm text-red-600 font-sans">
			{{ error }}
		</p>
		<p v-else-if="helperText" class="text-sm text-gray-500 font-sans">
			{{ helperText }}
		</p>
	</div>
</template>