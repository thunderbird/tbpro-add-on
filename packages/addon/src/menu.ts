import { BASE_URL } from '@send-frontend/apps/common/constants';

// TODO this needs to reflect the real login state at startup
// Initialize from login manager
let gLoggedIn  = false;

async function menuLogin() {
  await browser.tabs.create({
    url: `${BASE_URL}/login?isExtension=true`,
  });
}

async function menuManageDashboard() {
  await browser.tabs.create({
    url: "https://accounts-stage.tb.pro/dashboard"
  });
}

async function menuManageSend() {
  await browser.tabs.create({
    url: BASE_URL
  });
}

function menuCopyAppointmentLink() {
  // TODO
}

export async function menuLoggedIn(username) {
  await browser.TBProMenu.update("root", {
    title: "",
    secondaryTitle: username,
    tooltip: browser.i18n.getMessage("menuSignedInTooltip"),
  });
  await browser.TBProMenu.create("manageDashboard", {
    title: browser.i18n.getMessage("menuManageDashboard"),
    parentId: "root"
  });
  await browser.TBProMenu.create("manageSend", {
    title: browser.i18n.getMessage("menuManageSend"),
    parentId: "root"
  });
  //await browser.TBProMenu.create("copyAppointmentLink", {
  //  title: browser.i18n.getMessage("menuCopyAppointmentLink"),
  //  parentId: "root"
  //});
  await browser.TBProMenu.create("logout", {
    title: browser.i18n.getMessage("menuSignout"),
    parentId: "root"
  });
}

export async function menuLogout() {
  await browser.TBProMenu.update("root", {
    title: browser.i18n.getMessage("menuSignInTo"),
    secondaryTitle: browser.i18n.getMessage("thunderbirdPro"),
    tooltip: "",
  });
  await browser.TBProMenu.clear("root");
}

export function init() {
  browser.TBProMenu.onClicked.addListener(async (action) => {
    switch(action) {
      case "root":
        if (gLoggedIn) {
          return;
        }

        await menuLogin();
        break;
      case "logout":
        await menuLogout();
        gLoggedIn = false;
        break;
      case "manageDashboard":
        await menuManageDashboard();
        break;
      case "manageSend":
        await menuManageSend();
        break;
      case "copyAppointmentLink":
        await menuCopyAppointmentLink();
        break;
    }
  });

  browser.TBProMenu.create("root", {
    title: browser.i18n.getMessage("menuSignInTo"),
    secondaryTitle: browser.i18n.getMessage("thunderbirdPro"),
    tooltip: "",
  });
}
