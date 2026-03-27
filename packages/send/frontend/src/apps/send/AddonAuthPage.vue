<script setup lang="ts">
import { useAuthStore } from '@send-frontend/stores/auth-store';
import { SIGN_IN_COMPLETE } from '@send-frontend/lib/const';
import { useQuery } from '@tanstack/vue-query';
import { computed, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import LoadingComponent from '../common/LoadingComponent.vue';

const authStore = useAuthStore();
const router = useRouter();

const { error: queryError, isLoading } = useQuery({
  queryKey: ['addon-auth'],
  queryFn: async () => {
    const user = await authStore.authenticateWithAddonToken();

    if (user) {
      // Signal the background script to finalize post-login setup
      // (close the auth tab, run initCloudFile, open options page).
      window.postMessage({ type: SIGN_IN_COMPLETE }, window.location.origin);
      router.push('/send/profile?isExtension=true');
      return user;
    } else {
      throw new Error('Authentication failed');
    }
  },
  retry: 3,
});

const error = computed(() =>
  queryError.value instanceof Error
    ? queryError.value.message
    : queryError.value
      ? 'Authentication failed'
      : null
);

watchEffect(() => {
  if (queryError.value) {
    setTimeout(() => {
      router.push('/login');
    }, 3000);
  }
});
</script>

<template>
  <div class="addon-auth-container">
    <div v-if="isLoading" class="loading-section">
      <LoadingComponent />
      <p>Completing authentication...</p>
    </div>

    <div v-else-if="error" class="error-section">
      <h2>Authentication Error</h2>
      <p>{{ error }}</p>
      <p>Redirecting to login page...</p>
    </div>

    <div v-else class="success-section">
      <h2>Authentication Successful</h2>
      <p>Redirecting to your dashboard...</p>
    </div>
  </div>
</template>

<style scoped>
.addon-auth-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.loading-section,
.error-section,
.success-section {
  max-width: 400px;
}

.error-section h2 {
  color: var(--color-error, #dc3545);
}
</style>
