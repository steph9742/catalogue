<template>
  <main class="relative isolate min-h-screen overflow-hidden bg-linear-to-br from-primary-50/30 via-white to-secondary-50/60 px-4 py-8 sm:px-8">
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div class="absolute -left-[10%] -top-[10%] h-125 w-125 rounded-full bg-primary-300/30 blur-[120px] mix-blend-multiply" />
      <div class="absolute -right-[5%] top-[20%] h-150 w-150 rounded-full bg-secondary-300/25 blur-[120px] mix-blend-multiply" />
      <div class="absolute bottom-[-10%] left-[20%] h-175 w-175 rounded-full bg-accent-300/20 blur-[150px] mix-blend-multiply" />

      <div
        class="absolute inset-0 opacity-[0.015] mix-blend-overlay"
        style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')"
      />
    </div>

    <div class="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center relative z-10">
      <slot />
    </div>
  </main>
</template>
