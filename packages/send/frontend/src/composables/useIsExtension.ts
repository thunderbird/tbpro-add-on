import { BASE_URL } from '@send-frontend/apps/common/constants';
import { useConfigStore } from '@send-frontend/stores';
import { computed, onMounted, ref } from 'vue';

export function useIsExtension() {
  const isExtension = ref<boolean>(false);
  const { isThunderbirdHost } = useConfigStore();

  const isRunningInsideThunderbird = computed(() => {
    return isThunderbirdHost;
  });

  const isUrlMozExtension = computed(() => {
    return location.href.includes('moz-extension:');
  });

  const isAppNameAddon = computed(() => {
    return __APP_NAME__ === 'addon';
  });

  const environmentType = computed(() => {
    if (!isUrlMozExtension.value && isRunningInsideThunderbird.value) {
      return 'WEB APP INSIDE THUNDERBIRD';
    }
    if (isUrlMozExtension.value && isRunningInsideThunderbird.value) {
      return 'EXTENSION INSIDE THUNDERBIRD';
    }
    if (!isAppNameAddon.value && !isRunningInsideThunderbird.value) {
      return 'WEB APP OUTSIDE THUNDERBIRD';
    }

    return 'UNKNOWN ENVIRONMENT';
  });

  onMounted(() => {
    const urlMatchesBaseURL = window.location.href.includes(BASE_URL);
    if (urlMatchesBaseURL && !isThunderbirdHost) {
      isExtension.value = false;
      return;
    }
    isExtension.value = true;
  });
  return {
    isExtension,
    // for debugging
    isRunningInsideThunderbird,
    isAppNameAddon,
    isUrlMozExtension,
    // human readable
    environmentType,
  };
}
