<script setup lang="ts">
/**
 * PostLoginPage — Web to add-on, Steps 5–9.
 *
 * This is the OIDC redirect_uri (/post-login). accounts.tb.pro redirects here
 * after the user authenticates, appending the authorization code to the URL.
 * handleOIDCCallback() exchanges that code for tokens, notifies the background
 * script, and authenticates with the backend. On success the user is sent to
 * /send/profile; on failure (after 3 retries) they are redirected to /login.
 */
import { useIsRouteExtension } from '@send-frontend/composables/isRouteExtension';
import { useAuthStore } from '@send-frontend/stores/auth-store';
import { useQuery } from '@tanstack/vue-query';
import { computed, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import LoadingComponent from '../common/LoadingComponent.vue';

const authStore = useAuthStore();
const router = useRouter();
const { isRouteExtension } = useIsRouteExtension();

const { error: queryError, isLoading } = useQuery({
  queryKey: ['oidc-callback'],
  queryFn: async () => {
    // Step 5: Exchange the authorization code for tokens and finalize login.
    // handleOIDCCallback() calls oidc-client-ts signinCallback(), which reads
    // the code from the URL, POSTs to the token endpoint, and returns a User.
    const user = await authStore.handleOIDCCallback();

    if (user) {
      // Steps 6–8 have already run inside handleOIDCCallback().
      // isExtension=true tells the router guard to skip the key-backup check
      // so the extension popup can open immediately after login.
      router.push(`/send/profile?isExtension=${isRouteExtension.value}`);
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

// Redirect to login page on error
watchEffect(() => {
  if (queryError.value) {
    setTimeout(() => {
      router.push('/login');
    }, 3000);
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
