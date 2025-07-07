<script setup lang="ts">
// Optional props for customization
type Props = {
  size?: string;
  color?: string;
};

const { size = 'w-5 h-5', color = 'currentColor' } = defineProps<Props>();
</script>

<template>
  <svg :class="size" :fill="color" viewBox="0 0 20 20">
    <path
      fill-rule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      clip-rule="evenodd"
    />
  </svg>
</template>
