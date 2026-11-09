# Thundermail / Send — English (United States) source strings.
# Every message needs a translator comment; IDs change when meaning changes.

## Brand terms (never translated)
-send-brand = Thunderbird Send
-thundermail-brand = Thundermail

## Add-on shell (menu + manifest). Mirrors _locales/en/messages.json until that
## file is generated from this one.

# Label of the Thunderbird Pro menu entry that signs the user in.
# Variables: none
send-menu-sign-in-to = Sign in to
# Product name shown next to the sign-in entry.
send-brand-thunderbird-pro = Thunderbird Pro
# Menu entry that signs the user out.
send-menu-sign-out = Sign out
# Tooltip when the user is signed in. { $email } is the signed-in address.
send-menu-signed-in-tooltip = Signed in as { $email }
# Menu entry that opens the account dashboard.
send-menu-manage-dashboard = Manage Thunderbird Pro
# Menu entry that opens the Send file manager.
send-menu-manage-send = Manage Send files
# Menu entry that opens Appointment.
send-menu-open-appointment = Open Appointment

## German-proof slice (week 1): a handful of visible strings across surfaces.

# Compose popup title.
send-popup-title = Share with { -send-brand }
# Upload progress. { $count } is the number of files being uploaded.
send-upload-progress =
    { $count ->
        [one] Uploading { $count } file…
       *[other] Uploading { $count } files…
    }
# Button that signs the user out (management page, key backup page).
send-log-out = Log out
# Button that copies the share link.
send-copy-link = Copy link
# Confirmation after the link is copied.
send-link-copied = Link copied
# Generic error shown when the server reports a failure we have no copy for.
send-error-unknown = Something went wrong. Please try again.
# Used only by tests: an intentionally empty pattern must fall back to English.
send-test-empty-pattern = Test empty pattern
