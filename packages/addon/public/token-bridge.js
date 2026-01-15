const ALLOWED_ORIGINS = new Set([
  'https://auth-stage.tb.pro',
  'https://send-stage.tb.pro',
  'https://send-backend-stage.tb.pro',
  'http://localhost:5173', // dev
  'http://127.0.0.1:5173', // dev
]);

const PING = 'TB/PING';
const BRIDGE_PING = 'APP/PING';
const BRIDGE_READY = 'TB/BRIDGE_READY';
const OIDC_USER = 'TB/OIDC_USER';
const OIDC_TOKEN = 'TB/OIDC_TOKEN';
const SIGN_IN_COMPLETE = 'SIGN_IN_COMPLETE';
const ADDON_TO_WEBAPP = 'addon-to-webapp';
const WEBAPP_TO_ADDON = 'webapp-to-addon';

window.postMessage({ type: BRIDGE_READY }, window.location.origin);
console.log(`[🌉 token-bridge] the token bridge has loaded.`);

// Visual cue, make sure to remove.
const tag = document.createElement('div');
tag.textContent = '✅ Content script injected';
Object.assign(tag.style, {
  position: 'fixed',
  zIndex: 999999,
  inset: '8px auto auto 8px',
  padding: '6px 10px',
  background: 'lime',
  color: 'black',
  fontFamily: 'monospace',
  boxShadow: '0 2px 8px rgba(0,0,0,.25)',
});
// document.documentElement.appendChild(tag);

// Initial message to the background
browser.runtime.sendMessage({
  type: PING,
  text: 'This got sent from the bridge to the background.',
});

window.addEventListener('message', (e) => {
  // if (e.origin !== APP_ORIGIN) return;   // security: only trust your app
  // if (e.source !== window) return;       // same-page messages only
  // if (!e.data || e.data.type !== "TB_PING") return;

  if (e?.data?.type === OIDC_TOKEN) {
    // Forward to the background script
    browser.runtime.sendMessage({
      type: OIDC_TOKEN,
      token: String(e.data.token ?? ''),
      email: String(e.data.email ?? ''),
      name: String(e.data.name ?? ''),
    });
  }

  if (e?.data?.type === OIDC_USER) {
    const userData = e.data.user;

    if (userData && typeof userData === 'object') {
      browser.runtime.sendMessage({
        type: OIDC_USER,
        user: userData,
      });
    }
  }

  if (e?.data?.type === SIGN_IN_COMPLETE) {
    browser.runtime.sendMessage({
      type: SIGN_IN_COMPLETE,
    });
  }

  if (e?.data?.type === BRIDGE_PING) {
    browser.runtime.sendMessage({
      type: PING,
      text: String(e.data.text ?? ''),
    });
  }
  // Bridge translates WEBAPP_TO_ADDON: web app -> bridge -> add-on
  // (receive postMessage, send sendMessage)
  if (e?.data?.type === WEBAPP_TO_ADDON) {
    console.log(`🌉 doing message translation WEBAPP_TO_ADDON`);
    browser.runtime.sendMessage({
      type: WEBAPP_TO_ADDON,
      payload: e.data?.payload,
    });
  }
});

// Bridge translates ADDON_TO_WEBAPP: add-on -> bridge -> web app
// (receive sendMessage, send postMessage)
browser.runtime.onMessage.addListener(async (message, _, sendResponse) => {
  switch (message.type) {
    case ADDON_TO_WEBAPP:
      console.log(`🌉 doing message translation ADDON_TO_WEBAPP`);
      sendResponse({
        status: 'received/forwarded by bridge',
      });
      window.postMessage(
        { type: ADDON_TO_WEBAPP, payload: message.payload },
        window.location.origin
      );
  }
  return new Promise((resolve) => {
    resolve(true);
  });
});
