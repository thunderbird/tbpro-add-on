import { assertConfigured } from '@send-frontend/config';
import { createApp } from 'vue';
import BootDiagnostics from './BootDiagnostics.vue';

// Web-app entry ONLY (index.html), which is the one entry point that loads
// /config.js. Fail loud here rather than booting an SPA that renders and then
// fails every request against `undefined/api/...`. Deliberately NOT called from
// extension.js / management.js: those run inside the add-on XPI, which has no
// /config.js and is configured by the baked VITE_* values instead.
assertConfigured();

// Boot in two stages (Bugzilla 2064458). Everything behind `startApp` — the
// router, the Pinia stores, oidc-client-ts, services-ui — is imported
// dynamically, AFTER the diagnostics pass, because some of it touches
// localStorage/sessionStorage while being evaluated, and Firefox makes those
// getters throw when Thunderbird blocks all cookies. A static import here would
// hoist that evaluation ahead of this file's own code and the page would die
// blank before anything could explain why — which is exactly what happened to
// the login-screen banner. See lib/bootDiagnostics.ts.

let appModule;

// Starts downloading the app bundle. The panel calls this as soon as browser
// storage passes, so the download overlaps the network checks — and never
// earlier, because evaluating the bundle with storage denied is the very crash
// this bootstrap exists to explain.
function loadApp() {
  if (!appModule) {
    appModule = import('./startApp');
    // Nothing awaits this until `start`; mark a rejection as observed so the
    // browser does not report it as unhandled in the meantime. `start` awaits
    // the original promise and still receives the error.
    appModule.catch(() => {});
  }
  return appModule;
}

// The panel gets its own element rather than `#app`: the real app owns `#app`
// outright (no "app already mounted" warning, no shared `__vue_app__`), and
// the panel is still on screen to report a failure anywhere in `startApp`.
const bootRoot = document.createElement('div');
document.body.prepend(bootRoot);

const boot = createApp(BootDiagnostics, {
  preload: loadApp,
  start: async () => {
    const { startApp } = await loadApp();
    await startApp();
    boot.unmount();
    bootRoot.remove();
  },
});
boot.mount(bootRoot);
