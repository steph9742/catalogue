<script setup lang="ts">
const props = withDefaults(defineProps<{
  level?: '1' | '2' | '3' | '4' | '5' | '6'
}>(), {
  level: '1',
})

const headingClasses = computed(() => {
  switch (props.level) {
    case '1':
      return 'text-4xl'
    case '2':
      return 'text-3xl'
    case '3':
      return 'text-2xl'
    case '4':
      return 'text-xl'
    case '5':
      return 'text-lg'
    case '6':
      return 'text-base'
    default:
      return ''
  }
})
</script>

<template>
  <component
    :is="`h${level}`"
    :class="[headingClasses, 'font-bold font-sans tracking-tight text-gray-900']"
  >
    <slot />
  </component>
</template>
