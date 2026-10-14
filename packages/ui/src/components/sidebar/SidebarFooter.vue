<script setup lang="ts">

defineProps<{
    class?: string
}>()
</script>

<template>
    <footer :class="['shrink-0 px-1 pt-3 flex flex-col', $props.class]">
        <slot />
    </footer>
</template>