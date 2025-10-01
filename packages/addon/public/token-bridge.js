const ALLOWED_ORIGINS = new Set([
  "https://auth-stage.tb.pro",
  "http://localhost:5173",           // dev
  "http://127.0.0.1:5173"            // dev
]);

window.postMessage({ type: "TB/BRIDGE_READY" }, window.location.origin);
console.log(`[🌉 token-bridge] the token bridge has loaded.`);

// Visual cue, make sure to remove.
const tag = document.createElement("div");
tag.textContent = "✅ Content script injected";
Object.assign(tag.style, {
  position: "fixed", zIndex: 999999, inset: "8px auto auto 8px",
  padding: "6px 10px", background: "lime", color: "black",
  fontFamily: "monospace", boxShadow: "0 2px 8px rgba(0,0,0,.25)"
});
document.documentElement.appendChild(tag);

// Initial message to the background
browser.runtime.sendMessage({
  type: "TB/PING",
  text: "This got sent from the bridge to the background."
});


window.addEventListener("message", (e) => {
  // if (e.origin !== APP_ORIGIN) return;   // security: only trust your app
  // if (e.source !== window) return;       // same-page messages only
  // if (!e.data || e.data.type !== "TB_PING") return;

  if (e?.data?.type === "TB/OIDC_TOKEN") {
    // Forward to the background script
    browser.runtime.sendMessage({
      type: "TB/OIDC_TOKEN",
      token: String(e.data.token ?? "")
    });
  }

  if (e?.data?.type === "APP/PING") {
    browser.runtime.sendMessage({
      type: "TB/PING",
      text: String(e.data.text ?? "")
    });
  }
});

/*
// Optional handshake: lets the page know the bridge is ready
window.postMessage({ type: "TB_BRIDGE_READY" }, APP_ORIGIN);

window.addEventListener("message", async (e) => {
  // Mandatory security checks:
  if (e.origin !== APP_ORIGIN) return;   // verify sender origin
  if (e.source !== window) return;       // only accept messages from same-page context

  if (e.data && e.data.type === "OIDC_TOKEN") {
    const p = e.data.payload || {};
    // Forward to background
    await browser.runtime.sendMessage({
      type: "TB/OIDC_TOKEN",
      from: "content-script",
      url: location.href,
      payload: {
        access_token: p.access_token,
        id_token: p.id_token,
        token_type: p.token_type,
        scope: p.scope,
        expires_at: p.expires_at,
        // refresh_token: p.refresh_token, // include only if truly needed
        profile: p.profile
      }
    });

    // Ask the page to purge its copy if it wants
    window.postMessage({ type: "TB_BRIDGE_ACK" }, APP_ORIGIN);
  }
});
*/
