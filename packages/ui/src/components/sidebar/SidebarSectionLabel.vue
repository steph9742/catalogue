<script setup lang="ts">
defineProps<{
    class?: string
}>()
</script>

<template>
    <p :class="['text-xs font-medium text-gray-700 font-sans', $props.class]">
        <slot />
    </p>
</template>