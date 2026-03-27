<script setup lang="ts">
/**
 * AddonAuthPage — Add-On to Web entry point (Step 3 of the flow).
 *
 * This page is opened as a new browser tab by background.ts via
 * triggerAddonLogin() after the add-on has received an OIDC token set from
 * accounts.tb.pro (e.g. through AccountHub.onAccountAdded).
 *
 * Responsibilities:
 *  1. Call authenticateWithAddonToken(), which fetches the staged token set
 *     from the background (via the token-bridge), reconstructs the OIDC User,
 *     and authenticates with the backend.
 *  2. On success: post SIGN_IN_COMPLETE so the background closes this tab
 *     and runs its post-login setup (initCloudFile, open options page).
 *  3. On failure: redirect to /login after a short delay.
 *
 * This page mirrors the structure of PostLoginPage.vue, which handles the
 * equivalent step in the Web to add-on (web-initiated) OIDC redirect flow.
 */
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
    // Step 3: Kick off token retrieval + backend authentication.
    // authenticateWithAddonToken() handles the full Steps 3–8 internally.
    const user = await authStore.authenticateWithAddonToken();

    if (user) {
      // Step 9: Signal the background to finalize post-login setup.
      // The token-bridge forwards SIGN_IN_COMPLETE to background.ts, which
      // closes this tab, calls initCloudFile(), and opens the options page.
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

// After all retries are exhausted, give the user 3 seconds to read the error
// then redirect back to the manual login page.
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
