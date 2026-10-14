<script setup lang="ts">
defineProps<{
    class?: string
}>()
</script>

<template>
    <div :class="['block rounded-xl p-2 bg-white space-y-1.5', $props.class]">
        <slot />
    </div>
</template>