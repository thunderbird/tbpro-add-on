export async function openPopup(authUrl: string, finishLogin: () => void) {
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
  } catch (e) {
    console.log(`popup failed`);
    console.log(e);
  }
}
