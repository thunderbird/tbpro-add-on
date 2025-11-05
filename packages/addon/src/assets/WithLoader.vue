<script lang="ts" setup>
import LoadingComponent from '@send-frontend/apps/common/LoadingComponent.vue';

const { isLoading } = defineProps<{ isLoading: boolean }>();
</script>

<template>
  <LoadingComponent v-if="isLoading" />
  <slot v-else></slot>
</template>
