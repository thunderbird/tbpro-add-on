# Thundermail add-on shell — English (United States) source strings.
# Menu entries plus the manifest strings (add-on name, description, cloud file
# provider name). packages/addon/scripts/gen-locales.mjs turns every addon-*
# message into _locales/<locale>/messages.json (addon-menu-sign-in-to →
# menuSignInTo); those messages may use terms but no variables or selectors.

## Manifest

# Add-on name in the Add-ons Manager and the app menu.
addon-thunderbird-pro = { -thundermail-brand }
# Add-on description in the Add-ons Manager.
addon-extension-description = { -thundermail-brand } gives you an email address, appointment scheduling, and the ability to send large files with end-to-end encryption.
# Name of the cloud file provider in Composition > Attachments settings.
addon-thunderbird-send = { -send-brand }

## App menu

# Label of the menu entry that signs the user in; the product name follows it.
addon-menu-sign-in-to = Sign in to
# Menu entry that signs the user out.
addon-menu-sign-out = Sign out
# Tooltip of the menu entry while the user is signed in.
addon-menu-signed-in-tooltip = Signed in to { -thundermail-brand }
# Menu entry that opens the account dashboard in a tab.
addon-menu-manage-dashboard = Account Dashboard
# Menu entry that opens the Send file manager in a tab.
addon-menu-manage-send = Manage Send Files
# Menu entry that copies the user's Appointment booking link.
addon-menu-copy-appointment-link = Copy Appointment Link
# Menu entry that opens Appointment in a tab.
addon-menu-open-appointment = Open Appointment
