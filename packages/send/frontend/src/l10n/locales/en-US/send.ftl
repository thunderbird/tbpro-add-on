# Thundermail / Send — English (United States) source strings.
# Every message needs a translator comment; IDs change when meaning changes.

## Brand terms (never translated)
-send-brand = Thunderbird Send
-thundermail-brand = Thundermail

## German-proof slice (week 1): a handful of visible strings across surfaces.

# Compose popup title.
send-popup-title = Share with { -send-brand }
# Upload progress. { $count } is the number of files being uploaded.
send-upload-progress =
    { $count ->
        [one] Uploading { $count } file…
       *[other] Uploading { $count } files…
    }
# Button on the key backup page that signs the user out.
send-log-out = Log out
# Entry in the user menu that signs the user out.
send-sign-out = Sign out
# Button that copies the share link.
send-copy-link = Copy link
# Confirmation after the link is copied.
send-link-copied = Link copied
# Generic error shown when the server reports a failure we have no copy for.
send-error-unknown = Something went wrong. Please try again.
# Used only by tests: an intentionally empty pattern must fall back to English.
send-test-empty-pattern = Test empty pattern
