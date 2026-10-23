import { useConfigStore } from '@send-frontend/apps/send/stores/config-store';
import { trpc } from '@send-frontend/lib/trpc';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

export type ClientGateAction = 'none' | 'banner' | 'block';

const asString = (value: unknown) => (typeof value === 'string' ? value : null);

/**
 * Server-controlled update gate from the `settings` query. The boundary and the
 * banner share the query key, so this is one request. Until it resolves, if it
 * fails (including a failed refetch over cached data), against a server that
 * doesn't send `clientGate`, or for an action this build doesn't know, the
 * action is `none` and the app renders.
 */
export function useClientGate() {
  const { isThunderbirdHost } = useConfigStore();
  const { data, error } = useQuery({
    queryKey: ['settingsQuery'],
    queryFn: async () =>
      await trpc.settings.query({
        version: __APP_VERSION__,
        appName: __APP_NAME__,
        runtime: isThunderbirdHost ? 'thunderbird' : 'browser',
      }),
  });

  const gate = computed(() => {
    const clientGate = error.value ? null : data.value?.clientGate;
    const action: ClientGateAction =
      clientGate?.action === 'banner' || clientGate?.action === 'block'
        ? clientGate.action
        : 'none';
    return {
      action,
      minVersion: asString(clientGate?.minVersion),
      title: asString(clientGate?.title),
      message: asString(clientGate?.message),
    };
  });

  return { gate, clientVersion: __APP_VERSION__, error };
}
