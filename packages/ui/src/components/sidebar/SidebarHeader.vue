<script setup lang="ts">

defineProps<{
    class?: string
}>()
</script>

<template>
    <header :class="['shrink-0 px-1 py-2 flex flex-col', $props.class]">
        <slot />
    </header>
</template>