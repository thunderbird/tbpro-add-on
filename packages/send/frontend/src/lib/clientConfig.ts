import config from '@send-frontend/config';

// Anytime we try to access import.meta.env, we need to check if it's running on the client or server
// This function will return true if it's running on the client
function isClientExecution(): boolean {
  try {
    if (import.meta.env.MODE) return true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    throw new Error(
      'This code is running on server, it should be executed only on client'
    );
  }
}

// Build-MODE flags (Vite's own `MODE`) -- these say whether this bundle came out
// of `vite dev` or a production build. They are NOT environment identity; for
// "which deployment is this configured for", use getEnvName() below.
export const IS_PROD = isClientExecution()
  ? import.meta.env.MODE === 'production'
  : false;
export const IS_DEV = isClientExecution()
  ? import.meta.env.MODE === 'development'
  : false;

/**
 * The environment this bundle is configured for.
 *
 * This used to sniff `VITE_SEND_CLIENT_URL` for `send.tb.pro` /
 * `send-stage.tb.pro` / `localhost` and return `undefined` for anything else --
 * so tb-dev silently yielded `undefined`, and an unset client URL threw a
 * TypeError. It now reads the explicit `APP_ENV` / `VITE_APP_ENV` value, which
 * can name any environment and always resolves to a string.
 */
export const getEnvName = (): string => {
  isClientExecution();
  return config.appEnv;
};
