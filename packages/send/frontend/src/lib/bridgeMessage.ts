/**
 * Trust check for `window` 'message' events relayed by the add-on's
 * token-bridge content script (packages/addon/public/token-bridge.js).
 *
 * The bridge runs inside the Send page itself and always relays with
 * `window.postMessage(data, window.location.origin)`, so a legitimate message
 * arrives with `event.source === window` and
 * `event.origin === window.location.origin`. Anything else -- a message from
 * an embedded or embedding frame, a popup, or another origin -- must not be
 * able to answer a login-state query, hand us an OIDC token set, flip the
 * telemetry consent, or sign the user out. This is the page-side mirror of
 * the check the bridge applies before forwarding page messages to the
 * privileged background script.
 *
 * Every `addEventListener('message', ...)` in the Send frontend must go
 * through one of these helpers (SonarCloud rule S2819).
 */

/**
 * Returns true when `event` was posted by this page (or its content script)
 * to itself, which is the only channel the token-bridge protocol uses.
 */
export function isTrustedBridgeMessage(event: MessageEvent): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return event.source === window && event.origin === window.location.origin;
}

/**
 * Wraps a 'message' handler so it only runs for trusted bridge messages (see
 * isTrustedBridgeMessage). The returned function is what should be passed to
 * both `addEventListener` and `removeEventListener`.
 */
export function onBridgeMessage(
  handler: (event: MessageEvent) => void
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (!isTrustedBridgeMessage(event)) {
      return;
    }
    handler(event);
  };
}
