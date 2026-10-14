<script setup lang="ts">
defineProps<{
    class?: string
}>()
</script>

<template>
    <div :class="['space-y-2', $props.class]">
        <slot />
    </div>
</template>