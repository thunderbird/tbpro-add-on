// Creates three different accounts using different sample configurations.

// Sample AccountConfig for Gmail IMAP account
// const sampleAccountConfig = {
//     incoming: {
//         type: "imap",
//         hostname: "imap.gmail.com",
//         port: 993,
//         username: "testuser@gmail.com",
//         password: "your-app-password", // Use App Password for Gmail
//         socketType: 3, // SSL
//         auth: 10 // OAuth2 (or use 3 for plain text if using App Password)
//     },
//     outgoing: {
//         type: "smtp",
//         hostname: "smtp.gmail.com",
//         port: 587,
//         username: "testuser@gmail.com",
//         password: "your-app-password",
//         socketType: 2, // STARTTLS
//         auth: 10, // OAuth2 (or use 3 for plain text if using App Password)
//         addThisServer: true // Required: tells TB to create a new SMTP server
//     },
//     identity: {
//         realname: "Test User",
//         emailAddress: "testuser@gmail.com"
//     },
//     displayName: "Gmail Test Account"
// };

// browser.MailAccounts.createAccount(sampleAccountConfig).then(result => {
//     console.log(`Sample Gmail Account:`)
//     console.log(result);
// })

// Alternative sample for a generic IMAP provider
// const genericIMAPConfig = {
//     incoming: {
//         type: "imap",
//         hostname: "mail.example.com",
//         port: 993,
//         username: "user@example.com",
//         password: "userpassword",
//         socketType: 3, // SSL
//         auth: 3 // Plain text authentication
//     },
//     outgoing: {
//         type: "smtp",
//         hostname: "smtp.example.com",
//         port: 587,
//         username: "user@example.com",
//         password: "userpassword",
//         socketType: 2, // STARTTLS
//         auth: 3, // Plain text authentication
//         addThisServer: true // Required: tells TB to create a new SMTP server
//     },
//     identity: {
//         realname: "John Doe",
//         emailAddress: "user@example.com"
//     },
//     displayName: "Work Email"
// };

// browser.MailAccounts.createAccount(genericIMAPConfig).then(result => {
//     console.log(`Generic IMAP Account:`)
//     console.log(result);
// })

// Sample using existing SMTP server (common in corporate environments)
const reuseSmtpConfig = {
  incoming: {
    type: 'imap',
    hostname: 'imap.company.com',
    port: 993,
    username: 'example@tb.pro',
    password: 'employee-password',
    socketType: 3, // SSL
    auth: 3, // Plain text
  },
  outgoing: {
    useGlobalPreferredServer: true, // This will use the existing default SMTP server
  },
  identity: {
    realname: 'Employee Name',
    emailAddress: 'example@tb.pro',
  },
  displayName: 'Company Email',
};

// Add the TBPro menu to the app menu and setup example usage.
let loggedIn = false;
// Listen for events on the menu the handler is passed a windowId, and an action.
await browser.TBProMenu.onCommand.addListener(async (windowId, action) => {
  switch (action) {
    // header-click is the action for any click on the main app menu header.
    case 'header-click': {
      if (loggedIn) {
        return;
      }

      // If we are not logged in create a sample account as an example action.
      const result = await browser.MailAccounts.createAccount(reuseSmtpConfig);
      const username = reuseSmtpConfig.identity.emailAddress;

      if (!result) {
        console.error('create error');
        return;
      }

      // Add a submenu for logged in user.
      browser.TBProMenu.addSubMenu(username, 'tbpro-main-submenu');

      // Update the header button for logged in user and set it to
      // navigate to the submenu.
      browser.TBProMenu.updateMenuItem({
        text: '',
        boldText: username,
        nav: 'tbpro-main-submenu',
      });

      // Add a menu item to the submenu for managing accounts.
      browser.TBProMenu.addSubMenuItem({
        i18nId: 'manage',
        close: '',
        action: 'manage',
        id: 'tbpro-manage-button',
        menuId: 'tbpro-main-submenu',
      });

      // Add a menu item for signing out.
      browser.TBProMenu.addSubMenuItem({
        i18nId: 'signout',
        close: 'none',
        action: 'sign-out',
        menuId: 'tbpro-main-submenu',
      });

      // Add another submenu we will link from the first submenu.
      browser.TBProMenu.addSubMenu('Submenu Stuff', 'tbpro-sub-submenu');

      // Add an item to the first menu linking to the second submenu.
      browser.TBProMenu.addSubMenuItem({
        text: 'Sub Sub Menu',
        nav: 'tbpro-sub-submenu',
        menuId: 'tbpro-main-submenu',
        close: 'none',
      });

      // Add a submenu item to the second submenu.
      browser.TBProMenu.addSubMenuItem({
        text: 'Remove Manage',
        action: 'sub-submenu',
        menuId: 'tbpro-sub-submenu',
      });

      loggedIn = true;
      break;
    }
    // Handle the action we specified for the manage button.
    case 'manage':
      console.log('manage the things');
      break;
    // Handle the action we specified for the signout button and reset the header.
    case 'sign-out':
      console.log('signout');
      browser.TBProMenu.reset();
      loggedIn = false;
      break;
    // Handle the example sub sub menu which removes the manage entry from
    // the first submenu for an example of removal.
    case 'sub-submenu':
      console.log('remove-manage');
      browser.TBProMenu.removeSubMenuItem('tbpro-manage-button');
      break;
  }
});

// Overlay all already open normal windows.
let windows = await browser.windows.getAll({ windowTypes: ['normal'] });
for (let window of windows) {
  await addTBProMenu(window);
}

// Overlay any new normal window being opened.
browser.windows.onCreated.addListener(addTBProMenu);

async function addTBProMenu(window) {
  // Initalize the TBProMenu.
  await browser.TBProMenu.init(window.id);
}
