<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  src: string
  alt?: string
  fallbackName?: string
  icon?: string
}>()

const imageError = ref(false)

const initials = computed(() => {
  if (!props.fallbackName) return '?'
  return props.fallbackName
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
})

const fallbackBgColor = computed(() => {
  if (!props.fallbackName) return 'bg-gray-200'
  const hash = props.fallbackName.charCodeAt(0)
  const colors = [
    'bg-red-200',
    'bg-blue-200',
    'bg-green-200',
    'bg-yellow-200',
    'bg-purple-200',
    'bg-pink-200',
    'bg-indigo-200',
    'bg-cyan-200',
  ]
  return colors[hash % colors.length] ?? 'bg-gray-200'
})

const fallbackTextColor = computed(() => {
  return fallbackBgColor.value.replace('bg-', 'text-').replace('-200', '-700')
})
</script>

<template>
  <div
    v-if="imageError || !src"
    :class="['rounded-full size-8 flex items-center justify-center font-semibold text-sm', fallbackBgColor, fallbackTextColor]"
  >
    <Icon
      v-if="icon"
      :name="icon"
      class="size-4"
    />
    <template v-else>
      {{ initials }}
    </template>
  </div>
  <img
    v-else
    :src="src"
    :alt="alt || fallbackName"
    class="rounded-full size-8 object-cover"
    @error="imageError = true"
  >
</template>
