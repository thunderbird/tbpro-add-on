import { Page } from "@playwright/test";

export const fileLocators = (page: Page) => {
  const folderRowSelector = `[data-testid="folder-row"]`;
  const folderRowTestID = "folder-row";
  // Every test here works in the one folder the suite creates, so it wants "the
  // folder row", not "the only folder row". Taking the first tolerates the extra
  // folder #1190 occasionally produces (one press of "new folder" can create two),
  // which is an app bug none of these tests are about -- strict matching turned it
  // into a strict-mode violation that broke every test downstream of it.
  const firstFolderRow = page.getByTestId(folderRowTestID).first();
  const linkWithPasswordID = "link-with-password";
  const fileCountID = "file-count";
  const passwordInputID = "password-input";
  const submitButtonID = "submit-button";
  const tableCellID = `[data-testid="folder-table-row-cell"]`;
  const emptyFolderIndicator = page.getByTestId("empty-folder");
  const sharelinkButton = page.getByTestId("create-share-link");
  const submitButton = page.getByTestId(submitButtonID);
  const createdShareLink = page.getByTestId("access-link-item-0");
  const passwordInput = page.getByTestId(passwordInputID);
  const firstLink = createdShareLink.getByTestId("link-0");
  const uploadButton = page.getByTestId("upload-button");
  const downloadButton = page.getByTestId("download-button-0");
  const confirmDownload = page.getByTestId("confirm-download");
  const deleteFileButton = page.getByTestId("delete-file");
  const dropZone = page.getByTestId("drop-zone");
  return {
    folderRowSelector,
    firstFolderRow,
    sharelinkButton,
    createdShareLink,
    passwordInput,
    passwordInputID,
    firstLink,
    deleteFileButton,
    submitButton,
    submitButtonID,
    linkWithPasswordID,
    uploadButton,
    downloadButton,
    tableCellID,
    confirmDownload,
    fileCountID,
    dropZone,
    emptyFolderIndicator,
  };
};

export const dashboardLocators = (page: Page) => {
  const registerButton = page.getByTestId("register-button");
  const emailField = page.getByTestId("email");
  const passwordField = page.getByTestId("password");
  const confirmPasswordField = page.getByTestId("confirm-password");
  const submitButton = page.getByTestId("submit-button");
  const logOutButton = page.getByTestId("log-out-button");
  const submitLogin = page.getByTestId("login-submit-button");
  const backupKeysButton = page.getByTestId("encrypt-keys-button");
  const backupKeysButtonOverlay = page.getByTestId(
    "encrypt-keys-button-overlay"
  );
  const restoreKeysButton = page.getByTestId("restore-keys-button");
  const passphraseInput = page.getByTestId("backup-keys-passphrase-input");
  const passphraseInputOverlay = page.getByTestId(
    "backup-keys-passphrase-input-overlay"
  );
  const restorekeyInput = page.getByTestId("restore-key-input");

  const keyRecoveryButton = page.getByTestId("toggle-key-recovery");
  const keyRestoreButton = page.getByTestId("restore-keys");
  const confirmButton = page.getByTestId("confirm");
  const recoverAccessButton = page.getByTestId("recover-access-button");
  const understandCheckbox = page.getByTestId("understand-checkbox");
  const resetAccessButton = page.getByTestId("reset-access");
  const dangerButton = page.getByTestId("danger-button");
  const showReset = page.getByTestId("show-reset");

  return {
    registerButton,
    emailField,
    passwordField,
    confirmPasswordField,
    submitButton,
    logOutButton,
    submitLogin,
    backupKeysButton,
    restoreKeysButton,
    passphraseInput,
    passphraseInputOverlay,
    backupKeysButtonOverlay,
    restorekeyInput,
    keyRecoveryButton,
    keyRestoreButton,
    confirmButton,
    understandCheckbox,
    recoverAccessButton,
    resetAccessButton,
    dangerButton,
    showReset,
  };
};
