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
# Used only by tests: an intentionally empty pattern must fall back to English.
send-test-empty-pattern = Test empty pattern

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
# Second paragraph. "Send" is the short product name.
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
send-boot-cookies-blocked-title = { -thunderbird-brand } is blocking cookies for Send
# How to allow the cookie. The quoted names are settings; use their names in
# the localized application. The last quote is the Retry button.
send-boot-cookies-blocked-body = Send stores a cookie to keep you signed in, and your browser is currently refusing it. Open Settings → Privacy & Security → Web Content and turn on “Accept cookies from sites”. If that is already on, also set “Accept third-party cookies” to “From visited”. Then choose “{ send-boot-button-retry }”.
# Title when browser storage is blocked, so the app cannot load.
send-boot-storage-blocked-title = { -thunderbird-brand } is blocking storage for Send
# How to allow storage; same settings and Retry button as above.
send-boot-storage-blocked-body = Send keeps your sign-in state and encryption keys in browser storage, and your browser is refusing access to it. This happens when all cookies are blocked. Open Settings → Privacy & Security → Web Content and turn on “Accept cookies from sites”, then choose “{ send-boot-button-retry }”.
# Title when the app failed to load.
send-boot-app-load-failed-title = Send could not start
# Text below that title; refers to the Retry button.
send-boot-app-load-failed-body = The application failed to load. Choose “{ send-boot-button-retry }” to reload the page. If this keeps happening, please let us know.
