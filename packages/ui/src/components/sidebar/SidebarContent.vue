<script setup lang="ts">

defineProps<{
    class?: string
}>()
</script>

<template>
    <div :class="['flex-1 min-h-0 overflow-y-auto space-y-4 pr-1', $props.class]">
        <slot />
    </div>
</template>