<script setup lang="ts">
import { useIsRouteExtension } from '@send-frontend/composables/isRouteExtension';
import { useAuthStore } from '@send-frontend/stores/auth-store';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import LoadingComponent from '../common/LoadingComponent.vue';

const authStore = useAuthStore();
const router = useRouter();
const { isRouteExtension } = useIsRouteExtension();

const isLoading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    // Handle the OIDC callback
    const user = await authStore.handleOIDCCallback();

    if (user) {
      // Authentication successful, redirect to main app
      // We add the isExtension query parameter to the URL so that the extension will close the web version and open the extension
      router.push(`/send/profile?isExtension=${isRouteExtension.value}`);
    } else {
      throw new Error('Authentication failed');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Authentication failed';

    // Redirect to login page after a delay
    setTimeout(() => {
      router.push('/login');
    }, 3000);
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="post-login-container">
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
.post-login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
}

.loading-section,
.error-section,
.success-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  max-width: 400px;
}

.error-section {
  color: #dc3545;
}

.success-section {
  color: #28a745;
}

h2 {
  margin: 0;
  font-size: 1.5rem;
}

p {
  margin: 0;
  font-size: 1rem;
  line-height: 1.5;
}
</style>
