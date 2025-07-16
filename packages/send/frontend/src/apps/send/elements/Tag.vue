<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { TagColors } from '@send-frontend/apps/send/const';
import { IconTag } from '@tabler/icons-vue';
defineProps({
  // eslint-disable-next-line vue/require-default-prop
  color: String,
});
</script>
<template>
  <IconTag :class="['w-5 h-5', `${TagColors[color]}`]" />
  <slot></slot>
</template>
