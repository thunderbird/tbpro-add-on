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
send-upload-processing-file = Processing { $fileName }... ({ $current }/{ $total })
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
send-progress-stage-idle = Starting...
# While a checksum of the file is computed.
send-progress-stage-hashing = Hashing...
# While the upload is set up.
send-progress-stage-preparing = Preparing...
# While the file is encrypted on this device.
send-progress-stage-encrypting = Encrypting...
# While the file is sent to the server.
send-progress-stage-uploading = Uploading...
# While a file is fetched from the server.
send-progress-stage-downloading = Downloading...
# While a downloaded file is decrypted on this device.
send-progress-stage-decrypting = Decrypting...
# Any other processing step.
send-progress-stage-processing = Processing...
# The file is done.
send-progress-stage-completed = Completed
# The file failed.
send-progress-stage-error = Error
# Placeholder name while the file name is not known yet.
send-progress-file-pending = Processing file...
# Screen-reader summary. { $fileName } is the file, { $stage } one of the stage
# tags above, { $percent } a number from 0 to 100.
send-progress-status-label = Processing { $fileName }: { $stage }, { $percent }% complete
# Status shown while files upload.
send-upload-uploading = Uploading...

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
