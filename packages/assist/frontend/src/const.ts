const ONE_MINUTE = 60 * 1000;

export const SUMMARY_CHECK_INTERVAL = 15 * ONE_MINUTE;
export const ONE_DAY = 24;
export const PERCENTAGE_OF_RECENT_MAIL = 20;
export const MINIMUM_IMPORTANT_ODDS = 3;
export const LAST_SUMMARY_KEY = 'last_summary';

export const SEND_FEEDBACK = 'sendFeedback';
export const GEN_SUMMARY_CMD = 'generateSummary';
export const GEN_REPLY_CMD = 'generateReply';
export const REGEN_SUMMARY_CMD = 'regenerateSummary';
export const GET_BANNER_CMD = 'getBannerDetails';
export const GET_CURRENT_MSG_CMD = 'getCurrentMessageId';
export const GET_ENABLED_ACCOUNT_CMD = 'getEnabledAccount';
export const OPEN_OPTIONS_CMD = 'openOptions';
export const RELOAD_CONTENT_SCRIPT = 'reloadContentScript';
export const REMOVE_CONTENT_SCRIPT = 'removeContentScript';
export const LOG_ERROR_CMD = 'logError';

export const NO_SUMMARY_AVAILABLE = 'No summary available.';
export const FAILED_SUMMARY = 'Failed to generate summary.';
export const FAILED_SUMMARY_ENCRYPTED =
  'AI tools are disabled for encrypted emails. If you wish to modify this, you can go to the <a id="settingsLink" href="#">settings page</a> of the add-on.';
export const FAILED_AUTH = 'Please provide credentials in extension settings.';

export const CURR_EMAIL_CACHE_KEY = 'flowerIntelligenceChatCurrentEmailBody';
export const SUMMARY_CACHE_KEY = 'flowerintelligence-summary';
export const SUMMARY_PROMPT_CACHE_KEY = 'flowerintelligence-summarizer-prompt';
export const REPLY_CACHE_KEY = 'flowerintelligence-reply-prompt';
export const REMOTE_HANDOFF_CACHE_KEY = 'flowerintelligence-remote-handoff';
export const ENABLED_ACCOUNTS_CACHE_KEY = 'flowerintelligence-enabled-accounts';
export const ENCRYPTED_SUMMARY_CACHE_KEY = 'flowerintelligence-encrypted-summary';

export const DEFAULT_SUMMARY_PROMPT = `
You are a summarization engine that outputs only neutral, third-person summaries of emails.

Summarize the body of the following email in no more than three sentences.
* Do not mention the subject line in the summary.
* Do not include any introductory phrases or closings.
* Do not use first (or second) person pronouns.
* Use single line breaks only (do not insert blank lines).
* Output only the summary (no extra text).
`;
export const DEFAULT_REPLY_PROMPT =
  'Can you write a reply to the following email (the reply should start with `<REPLY_BEGIN>` and end with `<REPLY_END>`)?';
export const DEFAULT_REMOTE_HANDOFF = true;
export const DEFAULT_ENCRYPTED_EMAILS = false;

export const CATEGORY_ACTION = 'action';
export const CATEGORY_HIGHLIGHT = 'highlight';
export const CATEGORY_MISC = 'miscellaneous';

export const SUMMARY_CATEGORIES = [CATEGORY_ACTION, CATEGORY_HIGHLIGHT, CATEGORY_MISC];

export const FEEDBACK_EMAIL = import.meta.env.VITE_FEEDBACK_EMAIL as string;
export const FEEDBACK_SUBJECT = 'Assist thread summarizer feedback';
export const FEEDBACK_DISCLAIMER = `By clicking the feedback buttons, you consent to sharing the contents of this email with MZLA and Flower.ai solely to improve Thunderbird Assist, after which the data will be deleted.`;
export const FI_URL = 'https://unpkg.com/@flwr/flwr@latest/dist/flowerintelligence.bundled.es.js';
export const FI_DEFAULT_MODEL = 'meta/llama3.2-1b/instruct-fp16';
export const STORE_NAME_SETTINGS = 'settings';
export const STORE_NAME_SUMMARY_CACHE = 'summary-cache';
