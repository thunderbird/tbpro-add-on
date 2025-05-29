import posthog from 'posthog-js/dist/module.full.no-external';
export default {
  init() {
    console.log(`initializing Posthog`);
    console.log(import.meta.env.VITE_POSTHOG_PROJECT_KEY);
    console.log(import.meta.env.VITE_POSTHOG_HOST);
    posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST,
      persistence: 'memory',
    });
    posthog.register({
      service: 'assist',
    });
  },
  capture: (msg: string, obj?: Record<string, any>) => {
    posthog.capture(msg, obj);
  },
};
