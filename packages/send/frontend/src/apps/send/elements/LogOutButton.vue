<script setup lang="ts">
import OpenerIcon from '@send-frontend/apps/common/OpenerIcon.vue';

type LogOutProps = {
  logOut: () => Promise<void>;
};

defineProps<LogOutProps>();
</script>

<template>
  <div class="container">
    <button size="small" data-testid="log-out-button" @click.prevent="logOut">
      <span>Log out</span>
      <OpenerIcon />
    </button>
  </div>
</template>

<style scoped>
button {
  color: var(--primary-default);
  padding: 10px 20px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
}
</style>
