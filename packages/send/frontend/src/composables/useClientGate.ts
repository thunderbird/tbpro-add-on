import { trpc } from '@send-frontend/lib/trpc';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

/**
 * Server-controlled update gate from the `settings` query. The boundary and the
 * banner share the query key, so this is one request. Until it resolves, if it
 * fails, or against a server that doesn't send `clientGate`, the action is
 * `none` and the app renders normally.
 */
export function useClientGate() {
  const { data, error } = useQuery({
    queryKey: ['settingsQuery'],
    queryFn: async () =>
      await trpc.settings.query({
        version: __APP_VERSION__,
        appName: __APP_NAME__,
      }),
  });

  const gate = computed(() => ({
    action: data.value?.clientGate?.action ?? 'none',
    minVersion: data.value?.clientGate?.minVersion ?? null,
    message: data.value?.clientGate?.message ?? null,
  }));

  return { gate, clientVersion: __APP_VERSION__, error };
}
