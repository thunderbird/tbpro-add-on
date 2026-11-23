# Thundermail / Send — English (United States) source strings.
# Every message needs a translator comment; IDs change when meaning changes.

## Brand terms (never translated)

-send-brand = Thunderbird Send
-thundermail-brand = Thundermail
-thunderbird-brand = Thunderbird

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

## Upload flow (#1088 batch 1): drop zone, progress, upload steps, errors.

# Screen-reader label of the region shown while files upload.
send-upload-in-progress-label = Files are being uploaded
# Screen-reader label of the drop zone on the web app.
send-upload-dropzone-label = Drop files here or click to select files for upload
# Screen-reader instructions for the drop zone ("tap" covers touch screens).
send-upload-dropzone-instructions = Drop files here or tap to upload
# Heading above the files picked for upload. { $count } is the number of files.
send-upload-selected-files =
    { $count ->
        [one] Selected Files ({ $count } file):
       *[other] Selected Files ({ $count } files):
    }
# Screen-reader label of one picked file. { $position } and { $total } count
# the files, { $fileName } is its name, { $size } its formatted size (e.g. 2 MB).
send-upload-file-item-label = File { $position } of { $total }: { $fileName }, { $size }
# Screen-reader label of the button that removes { $fileName } before upload.
send-upload-remove-file-label = Remove { $fileName } from upload list
# Heading above the files that finished uploading. { $count } is the number of files.
send-upload-completed-files =
    { $count ->
        [one] Completed Uploads ({ $count } file):
       *[other] Completed Uploads ({ $count } files):
    }
# Screen-reader label of an uploaded file. { $fileName } is its name, { $size } its formatted size.
send-upload-completed-item-label = Completed upload: { $fileName }, { $size }
# Status tag next to a file that finished uploading.
send-upload-status-uploaded = Uploaded
# Heading above the files that failed to upload. { $count } is the number of files.
send-upload-failed-files =
    { $count ->
        [one] Failed Uploads ({ $count } file):
       *[other] Failed Uploads ({ $count } files):
    }
# Screen-reader label of a file that failed. { $fileName } is its name, { $size } its formatted size.
send-upload-failed-item-label = Failed upload: { $fileName }, { $size }
# Status tag next to a file that failed to upload.
send-upload-status-failed = Failed
# Screen-reader label of the upload button. { $count } is the number of picked files.
send-upload-button-label =
    { $count ->
        [one] Upload { $count } selected file
       *[other] Upload { $count } selected files
    }
# Upload button. { $count } is the number of picked files.
send-upload-button =
    { $count ->
        [one] Upload { $count } File
       *[other] Upload { $count } Files
    }
# Progress line while one file is processed. { $fileName } is the file,
# { $current } and { $total } count the files ("3/5").
send-upload-processing-file = Processing { $fileName }… ({ $current }/{ $total })
# Shown when every picked file uploaded. { $count } is the number of files.
send-upload-success-count =
    { $count ->
        [one] Successfully uploaded { $count } file
       *[other] Successfully uploaded { $count } files
    }
# Shown when some files failed. { $count } uploaded files, { $failed } failed files.
send-upload-partial-failure =
    { $count ->
        [one] Uploaded { $count } file, { $failed } failed
       *[other] Uploaded { $count } files, { $failed } failed
    }
# Error while reading the picked files. { $message } is a technical detail, usually English.
send-upload-error-processing = Error processing files: { $message }
# Error for one file. { $fileName } is the file, { $message } a technical detail, usually English.
send-upload-error-file-failed = Upload failed for { $fileName }: { $message }
# Detail used in the two errors above when the cause is unknown.
send-upload-error-unknown-detail = Unknown error
# Error when a picked file is over the size limit. { $max } is the limit, e.g. 18.63 GB.
send-upload-error-size-exceeded = Your upload exceeds the maximum upload size ({ $max }). Please remove the oversized files and try again.
# Error when an upload over the size limit reaches the store. { $max } is the limit, e.g. 20 GB.
send-upload-error-file-too-big = Your file size is not supported, please try with files smaller than { $max }
# Error when the upload would go over the user's storage quota.
send-upload-error-storage-limit = Uploading this file would exceed your storage limit. Please delete some files and try again.
# Alert when the storage quota stops an upload. { $fileName } is the file; the
# rest repeats the storage-limit error above.
send-upload-error-storage-limit-alert = Error uploading { $fileName }; { send-upload-error-storage-limit }
# Fallback error when an upload fails without a more specific message.
send-upload-error-generic = There was an error uploading your file, please try again or raise an issue
# Fallback error on the upload error step when no other message is available.
send-upload-error-retry = Upload failed. Please try again.
# Error when the encryption keys are locked (e.g. the passphrase changed on another device).
send-upload-error-keychain-locked = Cannot upload: encryption keys are locked. Please re-enter your passphrase.
# Error when the server accepted none of the files.
send-upload-error-not-uploaded = Could not upload file
# Error when the server did not accept { $fileName }.
send-upload-error-file-not-uploaded = Could not upload file { $fileName }
# Error when the upload worked but no share link came back.
send-upload-error-no-share-url = Did not get URL back from sharing
# Same error raised by the add-on popup ("sharingStore" is the part of the
# app that creates share links).
send-upload-error-no-share-url-store = Did not get URL back from sharingStore

## Upload progress stages (status tag next to the file).

# Before work on the file starts.
send-progress-stage-idle = Starting…
# While a checksum of the file is computed.
send-progress-stage-hashing = Hashing…
# While the upload is set up.
send-progress-stage-preparing = Preparing…
# While the file is encrypted on this device.
send-progress-stage-encrypting = Encrypting…
# While the file is sent to the server.
send-progress-stage-uploading = Uploading…
# While a file is fetched from the server.
send-progress-stage-downloading = Downloading…
# While a downloaded file is decrypted on this device.
send-progress-stage-decrypting = Decrypting…
# Any other processing step.
send-progress-stage-processing = Processing…
# The file is done.
send-progress-stage-completed = Completed
# The file failed.
send-progress-stage-error = Error
# Placeholder name while the file name is not known yet.
send-progress-file-pending = Processing file…
# Screen-reader summary. { $fileName } is the file, { $stage } one of the stage
# tags above, { $percent } a number from 0 to 100.
send-progress-status-label = Processing { $fileName }: { $stage }, { $percent }% complete
# Status shown while files upload.
send-upload-uploading = Uploading…

## Upload steps (add-on compose popup): password, expiration, result.

# Step counter above the step title; shown in capitals. { $current } and { $total } count the steps.
send-upload-step-indicator = STEP { $current } OF { $total }
# Button that returns to the previous step.
send-upload-button-back = Back
# Button that cancels the steps.
send-upload-button-cancel = Cancel
# Button that goes to the next step.
send-upload-button-next = Next
# Title of the step that sets when the link expires (also kept while uploading
# and on the error screen).
send-upload-expiration-title = Select File Expiration
# Button on the error screen that retries the upload.
send-upload-button-try-again = Try again
# Heading of the error screen.
send-upload-failed-title = Upload failed
# Explanation on the error screen.
send-upload-failed-description = We encountered an error while uploading your file. This could be due to network issues or file size limitations. Please check your connection and try again.
# Button that uploads the files and creates the share link.
send-upload-button-create-link = Create Link
# Introduction of the expiration step.
send-upload-expiration-description = Choose when the download link expires
# Expiration choice: the link never expires.
send-upload-expiration-never = Never expire
# Expiration choice. { $count } is a number of hours (24).
send-upload-expiration-hours =
    { $count ->
        [one] Expire in { $count } hour
       *[other] Expire in { $count } hours
    }
# Preselected expiration choice. { $count } is a number of days (14).
send-upload-expiration-days-default =
    { $count ->
        [one] Expire in { $count } day (default)
       *[other] Expire in { $count } days (default)
    }
# Expiration choice. { $count } is a number of days (30).
send-upload-expiration-days =
    { $count ->
        [one] Expire in { $count } day
       *[other] Expire in { $count } days
    }
# Expiration choice that reveals a date and time picker.
send-upload-expiration-custom = Select date and time
# Label of the date and time picker.
send-upload-expiration-custom-field = Select date and time
# Title of the password step.
send-upload-password-title = Create File Password
# Introduction of the password step.
send-upload-password-description = A file password provides an extra layer of security in case your email is accessed by an unintended recipient.
# Checkbox that turns on the file password.
send-upload-password-protect = Protect this file with a password (recommended)
# Label of the password field (a required-field asterisk follows it).
send-upload-password-label = File Password
# Placeholder of the password field.
send-upload-password-placeholder = Enter password
# Screen-reader label of the eye button; $state is "shown" while the password is visible.
send-upload-password-visibility =
    { $state ->
        [shown] Hide password
       *[hidden] Show password
    }
# Help text below the password field.
send-upload-password-help = Share this password with your recipient using a separate communication channel.
# Title of the screen shown once the share link exists.
send-upload-success-title = Link Created Successfully
# Button that closes the steps.
send-upload-button-close = Close
# Heading of the success screen.
send-upload-success-heading = Your file has been uploaded!
# Explanation on the success screen.
send-upload-success-description = Share this link with your recipient. They will need the password to access the file.
# Button that copies the share link.
send-upload-button-copy = Copy

## Files list and folder navigation (#1088 batch 2).

# Heading of the file list.
send-files-title = Your Files
# Error when the folder cannot be loaded. { $message } is a technical detail, usually English.
send-files-error-loading = Error loading folder: { $message }
# Button that loads the folder again after an error.
send-files-button-retry = Retry
# Heading shown when the folder holds no files.
send-files-empty-title = No files
# Text below the heading above.
send-files-empty-description = Uploaded files will appear here.
# Column header above the file and folder names.
send-files-column-name = Name
# Below a file or folder name. { $time } is a relative time that is already
# translated, e.g. "3 days ago".
send-files-last-modified = Last modified { $time }
# Title of the dialog that confirms deleting a file or folder from the list.
send-files-delete-item-title = Delete Item?
# Title of the dialog that confirms deleting a folder.
send-files-delete-folder-title = Delete Folder?
# Title of the dialog that confirms deleting a file.
send-files-delete-file-title = Delete File?
# Button that creates a folder.
send-files-button-new-folder = New Folder
# Button that saves the new name of a file or folder.
send-files-button-rename = Rename
# Screen-reader label of the side bar next to the file list.
send-files-sidebar-label = File management sidebar
# Screen-reader heading of the actions in the side bar.
send-files-actions-heading = File Management Actions
# Screen-reader heading of the upload area.
send-files-upload-heading = Upload Files
# Screen-reader label of the upload area.
send-files-upload-zone-label = Drag and drop files here to upload, or click to select files
# Text inside the upload area, shown on two lines ("tap" covers touch screens).
send-files-upload-zone-text =
    Drop files here
    or tap to upload

## File and folder details panel.

# Screen-reader label of the button that closes the folder details.
send-files-close-folder-info = Close folder info
# Screen-reader label of the button that closes the file details.
send-files-close-file-info = Close file info
# Label above the date the file or folder was created.
send-files-created = Created
# Label above the date the file or folder last changed.
send-files-modified = Modified
# Shown when the file's upload has expired.
send-files-expired = Expired
# Shown instead of the file details when the file was reported.
send-files-reported = This file has been reported for abuse. Please contact support if you believe this is a mistake.

## Share links: create, show once, list.

# Label of the menu that sets when a new share link expires.
send-share-expiration-label = Link Expires
# Expiration choice that reveals a date and time field.
send-share-expiration-custom = Custom date and time
# Label of the optional password field for a new share link.
send-share-password-label = Password
# Button text while the share link is being created.
send-share-creating = Creating…
# Button that creates a share link for the selected file.
send-share-button-create-file-link = Create Share Link
# Button that creates a share link for the selected folder.
send-share-button-create-folder-link = Create Access Link
# Error when the link exists but could not be marked as having no password.
send-share-error-passwordless-flag = The link was created, but its password status could not be updated.
# Error when the share link could not be created.
send-share-error-create = Failed to create access link. Please try again.
# Fallback error when creating the share link failed for an unknown reason.
send-share-error-unexpected = An unexpected error occurred.
# Label above a share link that was just created.
send-share-new-link-label = Your new link
# Screen-reader label of the field that holds the new share link.
send-share-new-link-field = New share link
# Copy button next to the new link; $state is "copied" for 3 seconds after a click.
send-share-copy-button =
    { $state ->
        [copied] Copied!
       *[idle] Copy
    }
# Warning below a new link that has no password.
send-share-new-link-notice = This link is only viewable to you now and cannot be retrieved if lost. You can generate more links at any time.
# Heading above the share links that already exist.
send-share-existing-links = Existing Links
# Screen-reader label of the field that holds an existing share link.
send-share-link-field = Share link
# Tooltip on an existing link that has no password.
send-share-passwordless-tooltip = Links without a password can only be viewed upon creation. You can delete this link to revoke access and create a new one anytime.
# Shown briefly after an existing link is copied.
send-share-link-copied = Copied!
# Tooltip of the button that deletes a share link.
send-share-delete-link = Delete link
# Tag on a link that needs a password.
send-share-status-password = Password
# Tag on a link that is locked after too many wrong passwords.
send-share-status-locked = Locked

## Share link page (recipient): password form, file details, download.

# Heading of the share link page.
send-download-ready-title = Your file is ready to download securely
# Heading of the password form on the share link page.
send-access-title = This file is password protected
# Label of the password field (a required-field asterisk follows it).
send-access-password-label = Password
# Help text below the password field.
send-access-password-prompt = Enter the password provided by the sender
# Button that submits the password.
send-access-button-continue = Continue
# Error when the password is wrong.
send-access-error-incorrect = This password is incorrect
# Shown below the error above. { $count } is the number of attempts left.
send-access-attempts-remaining =
    { $count ->
        [one] { $count } attempt remaining.
       *[other] { $count } attempts remaining.
    }
# Error when the link is locked after too many wrong passwords.
send-access-error-locked = This link has been locked after too many incorrect attempts.
# Error when the link was revoked or has expired.
send-access-error-invalid = Access Link is no longer valid
# Error when checking the password failed for another reason.
send-access-error-generic = An error occurred while processing your request
# Heading of the file details on the share link page; shown in capitals.
send-download-file-information = FILE INFORMATION
# Label of the sender's email address.
send-download-sender = Sender
# Shown when the sender is not known.
send-download-unknown-sender = Unknown sender
# Label of the file name.
send-download-filename = Filename
# Shown when the file name is not known.
send-download-unknown-file = Unknown file
# Label of the file size.
send-download-filesize = Filesize
# Shown when a value such as the checksum is not available.
send-download-not-available = Not available
# Button that shows or hides the file checksum.
send-download-view-checksum = View checksum
# Label of the checksum. SHA256 is the name of the algorithm.
send-download-checksum-label = Hash (SHA256)
# Tooltip of the button that copies the checksum; $state is "copied" for 2 seconds after a click.
send-download-copy-checksum =
    { $state ->
        [copied] Copied!
       *[idle] Copy to clipboard
    }
# Button that downloads the file.
send-download-button = Download
# Heading of the dialog shown before a download starts.
send-download-confirm-title = Before you download
# First paragraph of that dialog.
send-download-confirm-intro = You’re about to download a file through { -send-brand }.
# Second paragraph.
# "Send" is the product name; do not translate it.
send-download-confirm-not-scanned = Files sent with Send are end-to-end encrypted and aren’t scanned for viruses or malware.
# First advice in the list.
send-download-confirm-trust = Only download files you trust.
# Second advice in the list.
send-download-confirm-security = Use your own security software to protect your device.
# Last paragraph. MZLA Technologies is a company name; do not translate it.
send-download-confirm-liability = MZLA Technologies is not responsible for any issues resulting from this download.
# Link to the support site.
send-download-support = Support
# Link to the privacy policy.
send-download-privacy-policy = Privacy Policy

## Dashboard cards.

# Heading of the card that opens the file manager.
send-dashboard-manage-files-title = Manage Files
# Text of that card.
send-dashboard-manage-files-description = Open or manage your encrypted file storage in one secure place.
# Button of that card.
send-dashboard-manage-files-button = Access Your Files
# Text of the Send card on the add-on management page.
# "Send" is the product name; do not translate it.
send-dashboard-addon-description = Encrypted Storage: Manage your files and settings in the Send dashboard.
# Button that opens the Send dashboard in a tab.
send-dashboard-addon-button = Open Dashboard

## Files store: upload and download errors, download progress.

# Error when the user's session is incomplete when an upload starts.
send-upload-error-not-signed-in = You are not fully signed in. Please sign in again.
# Technical reason behind the error above; "ownerId" is a field name, keep it.
send-upload-error-no-user-id = Cannot upload: user session is missing a user id (ownerId would be empty).
# Short form of the storage-limit error, shown as the reason an upload failed.
send-upload-error-storage-limit-short = Uploading this file would exceed your storage limit.
# Reason an upload failed when the file is over the size limit.
send-upload-error-too-big = Too big
# Reason an upload failed when the server returned nothing. { $fileName } is the file.
send-upload-error-failed-for = Upload failed for { $fileName }
# Upload failure with its cause. { $message } is a technical detail, usually English.
send-upload-error-failed-detail = Upload failed: { $message }
# Progress title while a file downloads.
send-download-progress-downloading = Downloading file
# Progress title while a downloaded file is decrypted.
send-download-progress-decrypting = Decrypting file
# Download error when the folder's key is missing on this device.
send-download-error-no-key = Wrapping key not found
# Download error when none of the file's parts could be found.
send-download-error-no-pieces = No valid pieces found

## Sign-in and startup problems (also shown before the main app loads).

# Shown when the user is not signed in. "mozilla account" is the account system.
send-login-required = You need to log into your mozilla account. Make sure you’re in the allow list for alpha access.
# Button that runs the check again; the texts below refer to it by name.
send-boot-button-retry = Retry
# Title when the cookie that keeps the user signed in is blocked.
# "Send" is the product name; do not translate it.
send-boot-cookies-blocked-title = { -thunderbird-brand } is blocking cookies for Send
# How to allow the cookie. The quoted names are settings; use their names in
# the localized application. The last quote is the Retry button.
# "Send" is the product name; do not translate it.
send-boot-cookies-blocked-body = Send stores a cookie to keep you signed in, and your browser is currently refusing it. Open Settings → Privacy & Security → Web Content and turn on “Accept cookies from sites”. If that is already on, also set “Accept third-party cookies” to “From visited”. Then choose “{ send-boot-button-retry }”.
# Title when browser storage is blocked, so the app cannot load.
# "Send" is the product name; do not translate it.
send-boot-storage-blocked-title = { -thunderbird-brand } is blocking storage for Send
# How to allow storage; same settings and Retry button as above.
# "Send" is the product name; do not translate it.
send-boot-storage-blocked-body = Send keeps your sign-in state and encryption keys in browser storage, and your browser is refusing access to it. This happens when all cookies are blocked. Open Settings → Privacy & Security → Web Content and turn on “Accept cookies from sites”, then choose “{ send-boot-button-retry }”.
# Title when the app failed to load.
# "Send" is the product name; do not translate it.
send-boot-app-load-failed-title = Send could not start
# Text below that title; refers to the Retry button.
send-boot-app-load-failed-body = The application failed to load. Choose “{ send-boot-button-retry }” to reload the page. If this keeps happening, please let us know.

## Navigation and app shell (#1088 batch 3): header, footer, user menu.

# Header and footer link to the account overview page.
send-nav-dashboard = Dashboard
# Header and footer link to the files list.
send-nav-manage-files = Manage Files
# Header icon link (screen-reader label) and footer link to the settings page.
send-nav-settings = Settings
# Footer link to the sign-in page, shown while signed out.
send-nav-login = Login
# Footer link to the service status page.
send-nav-status = Status
# Footer link to the support contact form.
send-nav-support = Need help? Visit Support
# Footer link to the page where users suggest features.
send-nav-ideas = Ideas?
# Screen-reader label of the folder breadcrumb trail.
send-nav-breadcrumb-label = Breadcrumb navigation
# Screen-reader label of one breadcrumb entry. { $folderName } is the folder’s name.
send-nav-breadcrumb-item = Go to { $folderName } folder
# User menu entry that opens the account website.
send-menu-account = Account
# User menu entry that opens the subscription billing portal.
send-menu-manage-subscription = Manage subscription
# User menu entry that opens the support contact form.
send-menu-support = Support

## Sign-in and sign-out pages, compose popup setup prompt.

# Shown after signing out.
send-logout-title = You’re logged out
# Shown after signing out in the add-on window. { $count } is the seconds left.
send-logout-closing =
    { $count ->
        [one] This page will close in { $count } second…
       *[other] This page will close in { $count } seconds…
    }
# Shown after signing out on the web. { $count } is the seconds left.
send-logout-redirecting =
    { $count ->
        [one] You will be redirected to the homepage in { $count } second…
       *[other] You will be redirected to the homepage in { $count } seconds…
    }
# Title of the tab that opens after signing in from the add-on.
send-auth-complete-title = Authentication Complete
# Text below that title.
send-auth-complete-body = You can now close this window and return to { -thunderbird-brand }.
# Shown when a share link was locked after too many wrong passwords.
send-locked-title = This folder is locked
# Compose popup while signed out: title.
send-popup-login-title = Please log in to continue
# Compose popup while signed out: text below the title.
send-popup-login-body = A new window has been opened for you to log in.
# Compose popup when the encryption key is not set up yet: title.
# "Send" is the product name; do not translate it.
send-popup-setup-title = Finish setting up Send
# Text below that title.
send-popup-setup-body = To continue your upload, please complete your passphrase setup/recovery.
# Button that opens the key setup window again.
send-popup-setup-button = Continue Setup

## Welcome page (first sign-in from the add-on).

# Banner at the top of the welcome page.
send-welcome-signed-in = Sign-in complete.
# Heading of the welcome page.
send-welcome-title = Welcome to { -thundermail-brand }!
# Title of the mail card.
send-welcome-mail-title = Account added
# Text of the mail card.
send-welcome-mail-body = Your { -thundermail-brand } account has been automatically added to { -thunderbird-brand } Desktop.
# Title of the Send card.
send-welcome-send-title = Finish setup
# Text of the Send card.
send-welcome-send-body = Next, set your encryption password. Then you’re ready to send encrypted files or manage them from your { -thundermail-brand } account menu.
# Button that opens the encryption key setup.
send-welcome-send-button = Set encryption password

## Settings page and account overview.

# Heading of the settings page.
send-settings-title = Settings
# Shown on the settings page when deleting the Send data failed on the server.
send-settings-delete-failed = Something went wrong deleting your data. Please try again.
# Greeting above the user’s name on the account overview; the name follows on its own line.
send-dashboard-welcome = Welcome,
# Heading of the storage usage bar.
# "Send" is the product name; do not translate it.
send-storage-title = Send Storage
# Storage used. { $used } and { $limit } are formatted sizes, e.g. “2 GB of 20 GB”.
send-storage-used = { $used } of { $limit }
# Heading of the support links card.
send-support-title = Need Support?
# Support link.
send-support-account = Need help with your account? →
# Support link.
send-support-desktop = Troubleshooting for desktop →
# Support link.
send-support-encryption = Learn more about encryption →
# Support link.
send-support-export = Export your data →
# Heading of the encryption key card on the account overview.
send-security-title = Security & Privacy
# Description in the encryption key card.
send-security-description = Download a backup of your active encryption key, or reset your account if your key becomes locked or inaccessible.
# Button that opens the encryption key settings.
send-security-key-button = Encryption Key
# Button that opens the key recovery form when files are locked.
send-security-recover-button = Recover Access
# Warning on the account overview when the encryption key is missing on this device.
send-security-locked = Files access is locked. Restore or reset your encryption key to access file storage.
# Link next to that warning to the support site.
send-security-learn-more = Learn more
# Card on the account overview for users who don’t have the desktop app yet.
# "Send" is the product name; do not translate it.
send-dashboard-desktop-description = To use Send in { -thunderbird-brand } Desktop, install it and sign in from the { -thunderbird-brand } menu.
# Button that opens the desktop app download page.
send-dashboard-desktop-button = Download
# Alternative text of the desktop app screenshot.
send-dashboard-desktop-image = { -thunderbird-brand } desktop app

## Delete Send data (settings page).

# Heading of the section and of the confirmation card.
# "Send" is the product name; do not translate it.
send-delete-data-title = Delete Send Data
# Short description in the account overview section.
# "Send" is the product name; do not translate it.
send-delete-data-summary = Permanently delete all encrypted files in your { -thundermail-brand } Send storage.
# Link that opens the confirmation card.
# "Send" is the product name; do not translate it.
send-delete-data-link = Delete Send data
# Main warning on the confirmation card.
# "Send" is the product name; do not translate it.
send-delete-data-warning = This will permanently delete all encrypted files in your { -thundermail-brand } Send storage.
# Reassurance on the confirmation card.
send-delete-data-subscription = Your { -thundermail-brand } subscription will not be affected.
# Advice on the confirmation card.
send-delete-data-export = Be sure to export any files you want to keep before continuing.
# Required checkbox (an asterisk follows it).
send-delete-data-understand = I understand my encrypted files will be permanently deleted.
# Label of the key field (an asterisk follows it).
send-delete-data-key-label = Enter your Encryption Key to confirm
# Placeholder of the key field.
send-delete-data-key-placeholder = Your passphrase goes here
# Tooltip and screen-reader label of the eye button; $state is "shown" while the key is visible.
send-delete-data-key-visibility =
    { $state ->
        [shown] Hide Encryption Key
       *[hidden] Show Encryption Key
    }
# Button that deletes the data.
# "Send" is the product name; do not translate it.
send-delete-data-button = Delete Send Data
# Link that closes the confirmation card.
send-delete-data-cancel = Cancel
# Error when the typed key differs from the stored one.
send-delete-data-mismatch = Encryption Key does not match. Please try again.
# Error when the typed key cannot be read at all.
send-delete-data-invalid = Invalid Encryption Key format
# Heading after the data was deleted.
# "Send" is the product name; do not translate it.
send-delete-data-done-title = Your Send data has been deleted
# Text after the data was deleted.
# "Send" is the product name; do not translate it.
send-delete-data-done-body = All encrypted files in your { -thundermail-brand } Send storage have been permanently deleted. You can start fresh now.
# Reassurance after the data was deleted.
send-delete-data-done-mail = Your { -thundermail-brand } data was not affected.
# Button that reloads the account overview.
send-delete-data-done-button = Return to dashboard

## Admin page: delete a user’s data (staff only).

# Heading.
send-admin-title = Delete User Data
# Shown while the user list loads.
send-admin-loading = Loading users…
# Shown when the user list could not be loaded.
send-admin-load-failed = Failed to load users.
# Success. { $email } is the user’s email address (shown in bold).
send-admin-deleted = User data for { $email } was successfully deleted.
# Button that returns to the list.
send-admin-back = Back to user list
# Second confirmation. { $email } is shown in bold.
send-admin-final-warning = This will permanently delete all data for { $email }. This cannot be undone.
# Question below the second confirmation.
send-admin-are-you-sure = Are you sure?
# Error when the deletion failed.
send-admin-delete-failed = Delete failed. Please try again.
# Final delete button; $state is "deleting" while the request runs.
send-admin-delete-button =
    { $state ->
        [deleting] Deleting…
       *[idle] Yes, delete everything
    }
# Button that steps back.
send-admin-cancel = Cancel
# First confirmation. { $email } is shown in bold.
send-admin-first-warning = You are about to delete all data for { $email }.
# Button that moves to the second confirmation.
send-admin-continue = Continue
# Instructions above the user list.
send-admin-hint = Select a user to delete their data.
# Shown when there are no users.
send-admin-no-users = No users found.

## Encryption keys: first backup, recovery, management, reset.

# Heading of the first-time key backup overlay.
send-keys-backup-title = Complete your encryption setup
# First line of the overlay.
send-keys-backup-e2e = { -send-brand } uses end-to-end encryption.
# Explanation on the overlay.
send-keys-backup-intro = To finish setting up, you’ll need to create a recovery key. This key lets you access your encrypted files if you sign in on a new device, reinstall { -thunderbird-brand }, or get logged out.
# { $button } is the bold name of the button below (send-keys-backup-button).
send-keys-backup-finalized = Your key is finalized when you click { $button }.
# Button that downloads the key and finishes setup.
send-keys-backup-button = Download and Continue
# { $emphasis } is the bold rest of the sentence (send-keys-backup-never-stored); “It” is the key.
send-keys-backup-save = Save a copy in a safe place. It’s { $emphasis }
# Bold end of the sentence above.
send-keys-backup-never-stored = never stored on our servers and cannot be recovered if lost.
# Default label of the key field (an asterisk follows it).
send-keys-field-label = Encryption Key
# Tooltip of the eye button; $state is "shown" while the key is visible.
send-keys-field-visibility =
    { $state ->
        [shown] Hide
       *[hidden] Show
    }
# Tooltip of the button that makes a new key.
send-keys-field-regenerate = Regenerate
# Tooltip of the button that copies the key.
send-keys-field-copy = Copy
# Heading of the key recovery form.
send-keys-restore-title = Recover Access with Your Encryption Key
# Explanation on the key recovery form.
send-keys-restore-description = Enter your encryption key to verify your identity to access encrypted files and be able to upload new files.
# Label of the key field (an asterisk follows it).
send-keys-restore-label = Enter Encryption Key code
# Placeholder showing the key format: six words joined by dashes.
send-keys-restore-placeholder = text - text - text - text - text - text
# Button that recovers access with the typed key.
send-keys-restore-continue = Continue
# Button that leaves the recovery form.
send-keys-restore-cancel = Cancel
# Button that starts over with a new key when the old one is lost.
send-keys-restore-reset = Reset Access
# Error when the typed key cannot be read at all.
send-keys-restore-invalid = Invalid passphrase format
# Error when the typed key does not have six words. { $count } is how many words were typed.
send-keys-error-word-count = Expected 6 words, got { $count }
# Heading of the key management section (settings page and account overview).
send-keys-manage-title = Manage Encryption Key
# Explanation in the key management section.
send-keys-manage-description = This key restores your profile when you sign in on a new device. Your files are always encrypted locally, and the key is never stored on our servers. Save or download it to a secure place for future use.
# Tooltip and screen-reader label of the eye button; $state is "shown" while the key is visible.
send-keys-manage-visibility =
    { $state ->
        [shown] Hide key
       *[hidden] Show key
    }
# Tooltip of the button that copies the key.
send-keys-manage-copy = Copy to clipboard
# Tooltip of the button that downloads the key.
send-keys-manage-download = Download key
# Heading of the key reset section and of the reset dialog.
send-keys-reset-title = Reset Encryption Key
# Warning in the key reset section.
send-keys-reset-description = Resetting your encryption key permanently removes all files and clears your encrypted storage. This action cannot be undone.
# Button that opens the reset dialog.
send-keys-reset-button = Reset encryption key
# Reset dialog: about the new key shown below.
send-keys-reset-new-key = This is your new encryption key. Save a copy in a safe place: it’s never stored on our servers and cannot be recovered if lost.
# Reset dialog. { $button } is the bold name of the confirm button (send-keys-reset-confirm).
send-keys-reset-stays-active = Your current key stays active until you click { $button }. After that, files encrypted with your previous key will no longer be accessible.
# Reset dialog: label of the new key field.
send-keys-reset-new-key-label = New Encryption Key
# Reset dialog: required checkbox.
send-keys-reset-understand = I understand I’ll lose access to my old files.
# Reset dialog: closes it and keeps the current key.
send-keys-reset-cancel = Cancel
# Reset dialog: downloads the new key and replaces the old one.
send-keys-reset-confirm = Download key and reset
# Heading when the keys on this device no longer match the account.
send-keys-changed-title = Warning
# Explanation below that heading.
send-keys-changed-body = Your keys are incorrect. This may happen if you reset your passphrase on a different device. Click below to clear the outdated keys on this device; you’ll then be asked for your new passphrase to restore access.
# Button that clears the old keys and opens the recovery form.
send-keys-changed-button = Enter new passphrase

## Confirmations: delete a file or folder, report content.

# Delete dialog. $type is "folder" or "file"; { $name } is its name (shown in bold).
send-confirm-delete-question =
    { $type ->
        [folder] Are you sure you want to delete the folder “{ $name }”?
       *[file] Are you sure you want to delete the file “{ $name }”?
    }
# Delete dialog, folders only.
send-confirm-delete-contents = This will also delete all files and folders contained within it.
# Delete dialog.
send-confirm-delete-irreversible = This action cannot be undone.
# Delete dialog button; $state is "deleting" while the request runs.
send-confirm-delete-button =
    { $state ->
        [deleting] Deleting…
       *[idle] Yes, Delete
    }
# Delete dialog button that closes it.
send-confirm-delete-cancel = Cancel
# Shown after the user reported a shared file.
send-report-thanks = Thank you for your report!
# Question below a shared file’s details; the link follows.
send-report-question = Is this content harmful?
# Link that starts a report.
send-report-link = Report it
# { $link } is a link labelled with send-report-confirm-link.
send-report-confirm = Please confirm your report { $link }
# Link text that sends the report.
send-report-confirm-link = here
