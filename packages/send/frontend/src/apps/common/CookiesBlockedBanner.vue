<script lang="ts" setup>
/**
 * Login-screen banner for blocked cookies (Bugzilla 2064458).
 *
 * The Send backend keeps the session in an httpOnly, SameSite=None cookie;
 * when the browser/Thunderbird refuses it, the entire app is non-functional.
 * Post-login detection (cookie-gated routes failing while Bearer routes
 * succeed) needs a live session to infer from, so this banner runs the
 * positive pre-login round-trip probe in `cookieProbe.ts` instead and warns
 * before the user even attempts to log in.
 *
 * The same probe also runs in the pre-app boot check (BootDiagnostics.vue),
 * which is what a user sees first: this banner covers the case where they
 * chose "Continue anyway" there, or navigated here later.
 *
 * Deliberately NOT dismissible: unlike the update prompt in
 * CompatibilityBanner, there is nothing useful the user can do in the app
 * while cookies are blocked. The banner only shows on a *positive* 'blocked'
 * answer — 'unknown' and loading states stay hidden, so an offline user or an
 * older backend never sees a false warning.
 */
import { probeCookiesEnabled } from '@send-frontend/lib/cookieProbe';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import useApiStore from '@send-frontend/stores/api-store';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

const { api } = useApiStore();

const { data, refetch } = useQuery({
  queryKey: ['cookie-probe'],
  queryFn: async () => await probeCookiesEnabled(api),
});

const isBlocked = computed(() => data?.value === 'blocked');
</script>

<template>
  <header v-if="isBlocked" data-testid="cookies-blocked-banner">
    <div class="warning">
      <p class="title">{{ CLIENT_MESSAGES.COOKIES_BLOCKED_TITLE }}</p>
      <p data-testid="cookies-blocked-banner-body">
        {{ CLIENT_MESSAGES.COOKIES_BLOCKED_BANNER_BODY }}
      </p>
      <button
        type="button"
        data-testid="cookies-blocked-banner-retry"
        @click="refetch()"
      >
        Retry
      </button>
    </div>
  </header>
</template>

<style scoped>
header {
  position: relative;
}
.warning {
  background: var(--colour-warning-default);
  padding: 1rem;
}
.title {
  font-weight: bold;
}
button {
  margin-top: 0.5rem;
  padding: 0.25rem 0.75rem;
  font-weight: bold;
  cursor: pointer;
}
</style>
