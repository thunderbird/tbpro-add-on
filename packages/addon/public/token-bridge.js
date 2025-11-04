const ALLOWED_ORIGINS = new Set([
  "https://auth-stage.tb.pro",
  "https://send-stage.tb.pro",
  "https://send-backend-stage.tb.pro",
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
      token: String(e.data.token ?? ""),
      email: String(e.data.email ?? ""),
      preferred_username: String(e.data.preferred_username ?? ""),
    });
  }

  if (e?.data?.type === "APP/PING") {
    browser.runtime.sendMessage({
      type: "TB/PING",
      text: String(e.data.text ?? "")
    });
  }
});
