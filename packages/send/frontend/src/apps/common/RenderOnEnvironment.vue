<script lang="ts" setup>
import { useIsExtension } from '@send-frontend/composables/useIsExtension';

type EnvironmentType = ReturnType<
  typeof useIsExtension
>['environmentType']['value'];

const props = defineProps<{
  environmentType: EnvironmentType | EnvironmentType[];
}>();

const { environmentType: computedEnvironmentType } = useIsExtension();
// Determine if the current environment matches the props, handles array or single value
const matches = Array.isArray(props.environmentType)
  ? props.environmentType.includes(computedEnvironmentType.value)
  : computedEnvironmentType.value === props.environmentType;
</script>

<template>
  <slot v-if="matches"></slot>
</template>
