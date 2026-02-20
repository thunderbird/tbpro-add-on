<script setup lang="ts">
type Props = {
  type?: 'primary' | 'secondary';
};
const { type = 'primary' } = defineProps<Props>();
defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    class="pro-button"
    :class="{
      'pro-button--primary': type === 'primary',
      'pro-button--secondary': type === 'secondary',
    }"
    @click="$emit('click')"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

.pro-button {
  min-width: 149px;
  height: 44px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  color: white;
  transition: all 0.2s ease;
}

.pro-button--primary {
  box-shadow: 0px 4px 0 rgba(0, 0, 0, 0.12);
  background-image: linear-gradient(
    to bottom,
    #37adf9 -20%,
    #1373d9 20%,
    #175fb6 80%
  );
}

.pro-button--primary:hover {
  transform: translateY(1px);
  box-shadow: 0px 3px 0 rgba(0, 0, 0, 0.12);
}

.pro-button--primary:active {
  transform: translateY(2px);
  box-shadow: 0px 2px 0 rgba(0, 0, 0, 0.12);
}

.pro-button--secondary {
  min-width: auto;
  background: transparent;
  box-shadow: none;
  color: #175fb6;
  font-weight: normal;
  line-height: 1.23;
  text-shadow: 0.5px 0.5px 0 rgba(255, 255, 255, 0.1);
}

.pro-button--secondary:hover {
  opacity: 0.85;
}

.pro-button--secondary:active {
  opacity: 0.7;
}
</style>
