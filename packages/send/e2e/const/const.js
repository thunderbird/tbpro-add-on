// playwright test tags
export const PLAYWRIGHT_TAG_DEV_DESKTOP = '@dev-desktop';
export const PLAYWRIGHT_TAG_DESKTOP_NIGHTLY = '@desktop-nightly';
export const PLAYWRIGHT_TAG_MOBILE_NIGHTLY = '@mobile-nightly';

// test environment details
export const TB_SEND_TARGET_ENV = String(process.env.TB_SEND_TARGET_ENV);
export const TB_SEND_BASE_URL = String(process.env.TB_SEND_BASE_URL);
export const TB_ACCTS_EMAIL = String(process.env.TBPRO_USERNAME);
export const TB_ACCTS_PWORD = String(process.env.TBPRO_PASSWORD);

// timeout values
export const TIMEOUT_1_SECOND = 1_000;
export const TIMEOUT_5_SECONDS = 5_000;
export const TIMEOUT_10_SECONDS = 10_000;
export const TIMEOUT_30_SECONDS = 30_000;
export const TIMEOUT_60_SECONDS = 60_000;
