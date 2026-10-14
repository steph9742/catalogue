<script setup lang="ts">
withDefaults(defineProps<{
    size?: 'sm' | 'md' | 'lg' | 'icon'
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link'
    asChild?: boolean
}>(), {
    size: 'md',
    variant: 'primary',
    asChild: false
})

const sizeClasses = {
    sm: 'px-2 py-1 text-xs rounded has-[>svg]:px-1.5 has-[>svg]:py-0.5',
    md: 'px-3 py-1.5 text-sm rounded-lg has-[>svg]:px-2 has-[>svg]:py-1',
    lg: 'px-3.5 py-1.75 text-lg rounded-lg has-[>svg]:px-2.5 has-[>svg]:py-1.25',
    icon: 'p-2 rounded-md',
}

const variantClasses = {
    primary: 'bg-primary-500 text-white hover:bg-primary-600',
    secondary: 'bg-gray-500 text-white hover:bg-gray-600',
    outline: 'bg-transparent border border-gray-400/30 text-gray-500 hover:bg-gray-100 shadow-xs',
    ghost: 'bg-transparent text-gray-500 hover:bg-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    link: 'bg-transparent text-text hover:underline',
}

// Un bouton désactivé gardait l'apparence d'un bouton actif : on cliquait, rien ne se passait,
// et rien ne disait pourquoi.
const disabledClasses = 'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'
</script>

<template>
    <component :is="asChild ? 'template' : 'button'" :class="[sizeClasses[size], variantClasses[variant], disabledClasses, 'inline-flex justify-center items-center gap-2 transition-colors duration-80 whitespace-nowrap font-sans tracking-tighter ']">
        <slot />
    </component>

</template>