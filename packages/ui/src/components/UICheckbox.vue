<script setup lang="ts">
import { computed, ref, watch } from 'vue'

defineOptions({
	inheritAttrs: false,
})

type UICheckboxSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
	id?: string
	name?: string
	label?: string
	description?: string
	required?: boolean
	disabled?: boolean
	readonly?: boolean
	indeterminate?: boolean
	helperText?: string
	error?: string
	size?: UICheckboxSize
	checkedIcon?: string
	uncheckedIcon?: string
	indeterminateIcon?: string
}>(), {
	required: false,
	disabled: false,
	readonly: false,
	indeterminate: false,
	size: 'md',
	checkedIcon: 'lucide:check',
	uncheckedIcon: '',
	indeterminateIcon: 'lucide:minus',
})

const model = defineModel<boolean>({
	default: false,
})

const inputRef = ref<{ indeterminate: boolean } | null>(null)

const hasError = computed(() => Boolean(props.error))

const checkboxStatus = computed(() => {
	if (props.indeterminate) {
		return 'indeterminate'
	}

	return model.value ? 'checked' : 'unchecked'
})

const iconName = computed(() => {
	if (checkboxStatus.value === 'indeterminate') {
		return props.indeterminateIcon
	}

	if (checkboxStatus.value === 'checked') {
		return props.checkedIcon
	}

	return props.uncheckedIcon
})

const sizeClasses: Record<UICheckboxSize, string> = {
	sm: 'size-4',
	md: 'size-5',
	lg: 'size-6',
}

const iconSizeClasses: Record<UICheckboxSize, string> = {
	sm: 'size-3',
	md: 'size-3.5',
	lg: 'size-4',
}

const boxClasses = computed(() => {
	const palette = hasError.value
		? 'border-red-400 bg-red-50 text-red-600 group-focus-within:ring-red-500/35'
		: 'border-gray-300 bg-white text-gray-400 group-focus-within:ring-primary-500/30'

	const checkedPalette = hasError.value
		? 'border-red-500 bg-red-100 text-red-700'
		: 'border-primary-500 bg-primary-50 text-primary-600'

	return [
		'shrink-0 rounded-md border transition-colors duration-150 grid place-items-center',
		'group-focus-within:ring-2',
		'group-hover:border-primary-400',
		'group-has-[:disabled]:bg-gray-100 group-has-[:disabled]:text-gray-400 group-has-[:disabled]:border-gray-200',
		sizeClasses[props.size],
		palette,
		checkboxStatus.value !== 'unchecked' ? checkedPalette : '',
	]
})

const iconClasses = computed(() => {
	if (checkboxStatus.value === 'unchecked') {
		return [iconSizeClasses[props.size], 'opacity-55']
	}

	return [iconSizeClasses[props.size], 'opacity-100']
})

const onInputChange = (event: Event) => {
	const target = event.target as unknown as { checked: boolean }

	if (props.readonly) {
		target.checked = model.value
		return
	}

	model.value = target.checked
}

watch([inputRef, () => props.indeterminate], () => {
	if (!inputRef.value) {
		return
	}

	inputRef.value.indeterminate = props.indeterminate
}, { immediate: true })
</script>

<template>
	<div class="w-full space-y-1.5">
		<label class="group inline-flex items-start gap-3 select-none" :for="id">
			<input
				v-bind="$attrs"
				:id="id"
				ref="inputRef"
				:name="name"
				type="checkbox"
				:checked="model"
				:required="required"
				:disabled="disabled"
				:aria-invalid="hasError ? 'true' : undefined"
				class="sr-only"
				@change="onInputChange"
			>

			<span :class="boxClasses">
				<Icon :name="iconName" :class="iconClasses" />
			</span>

			<span class="space-y-0.5 leading-tight">
				<span v-if="label" class="block text-sm font-mono font-medium tracking-tighter text-gray-800">
					{{ label }}
					<span v-if="required" class="ml-0.5 text-red-500">*</span>
				</span>
				<span v-if="description" class="block text-sm text-gray-500 font-sans">
					{{ description }}
				</span>
			</span>
		</label>

		<p v-if="hasError" class="text-sm text-red-600 font-sans">
			{{ error }}
		</p>
		<p v-else-if="helperText" class="text-sm text-gray-500 font-sans">
			{{ helperText }}
		</p>
	</div>
</template>
