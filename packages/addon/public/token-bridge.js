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
const SEND_MESSAGE_TO_BRIDGE = 'SEND_MESSAGE_TO_BRIDGE';
const GET_LOGIN_STATE = 'GET_LOGIN_STATE';
const LOGIN_STATE_RESPONSE = 'LOGIN_STATE_RESPONSE';
const FORCE_CLOSE_WINDOW = 'FORCE_CLOSE_WINDOW';

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

  if (e?.data?.type === SEND_MESSAGE_TO_BRIDGE) {
    browser.runtime.sendMessage({
      type: SEND_MESSAGE_TO_BRIDGE,
      value: e.data.value,
    });
  }

  if (e?.data?.type === GET_LOGIN_STATE) {
    browser.runtime.sendMessage({
      type: GET_LOGIN_STATE,
    });
  }

  if (e?.data?.type === FORCE_CLOSE_WINDOW) {
    browser.runtime.sendMessage({
      type: FORCE_CLOSE_WINDOW,
    });
  }
});

// Listen for responses from background script and forward to web app
browser.runtime.onMessage.addListener((message) => {
  if (message.type === LOGIN_STATE_RESPONSE) {
    window.postMessage(
      {
        type: LOGIN_STATE_RESPONSE,
        isLoggedIn: message.isLoggedIn,
        username: message.username,
      },
      window.location.origin
    );
  }
});
