import { FORCE_CLOSE_WINDOW } from '@send-frontend/lib/const';

/**
 * Open a URL in its own popup window and invoke `finishLogin` once that window
 * is closed. Returns `true` if the window was created, `false` if it failed —
 * callers rely on this so they don't get stuck in an "opening…" state when the
 * window never appears (the `finishLogin` callback only runs on close).
 */
export async function openPopup(
  authUrl: string,
  finishLogin: () => void
): Promise<boolean> {
  try {
    const popup = await browser.windows.create({
      url: authUrl,
      type: 'popup',
      allowScriptsToClose: true,
    });

    const checkPopupClosed = (windowId: number) => {
      if (windowId === popup.id) {
        browser.windows.onRemoved.removeListener(checkPopupClosed);
        finishLogin();
      }
    };
    browser.windows.onRemoved.addListener(checkPopupClosed);
    return true;
  } catch (e) {
    console.log(`popup failed`);
    console.log(e);
    return false;
  }
}

/**
 * Close the current window from a Send web page. The token-bridge content
 * script relays FORCE_CLOSE_WINDOW to the add-on background, which owns tab
 * teardown; `window.close()` is a fallback for contexts without the bridge.
 */
export function forceCloseWindow() {
  try {
    window.postMessage({ type: FORCE_CLOSE_WINDOW }, window.location.origin);
  } catch (error) {
    console.error('Error posting FORCE_CLOSE_WINDOW message:', error);
  }
  try {
    window.close();
  } catch (error) {
    console.error('Error closing window:', error);
  }
}
