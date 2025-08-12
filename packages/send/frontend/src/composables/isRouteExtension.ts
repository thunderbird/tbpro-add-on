import { computed } from 'vue';
import { useRouter } from 'vue-router';

/**
 * Composable to check if the current route has the isExtension query parameter set to 'true'
 * @returns A computed ref that returns true if the route indicates it's from an extension
 */
export function useIsRouteExtension() {
  const router = useRouter();

  const isRouteExtension = computed(() => {
    // check if query parameter 'isExtension' is present in the route
    return router?.currentRoute?.value.query?.isExtension === 'true';
  });

  return {
    isRouteExtension,
  };
}
