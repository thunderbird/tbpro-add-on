import posthog from '@send-frontend/plugins/posthog';
import { defineStore } from 'pinia';

const initializeClientMetrics = (uid: string | undefined) => {
  if (!uid) {
    return;
  }
  posthog.rest.identify(uid);
};

const useMetricsStore = defineStore('metrics', () => {
  const metrics = posthog.rest;

  return {
    metrics,
    initializeClientMetrics,
  };
});

export default useMetricsStore;
