/// <reference types="thunderbird-webext-browser" />
/// <reference path="../types/wink-naive-bayes-text-classifier.d.ts" />
/// <reference path="../types/prep-text.d.ts" />

import {
  CLASSIFICATION,
  ClassifierError,
  ImportanceClassifier,
  type AddressConfiguration,
  type EmailMessageWithPrediction,
} from '@/lib/ImportanceClassification';
import {
  MESSAGE_TYPE,
  getMessageHeaders,
  getMessagesWithBody,
  type EmailMessage,
} from '@/lib/Messages';
import { logger } from '@thunderbirdops/services-utils';
import { frequencyMapForMessages, type FrequencyMap } from '@/lib/FrequencyMap';
import { getAddressBookEmailArray, type EmailAddress } from '@/lib/AddressBook';
import SummaryModel, { type SummaryResponse } from '@/lib/SummaryModel';

import { SummaryScheduler } from '@/lib/SummaryScheduler';
import { AssistStorage } from '@/lib/AssistStorage';

import metrics from '@/lib/metrics';

import {
  fetchEmailBodyAndHash,
  getBanner,
  getFlwrApiKey,
  getReplyById,
  getSummaryById,
  summarizeOnReceive,
} from '@/lib/flowerUtils';

import {
  SUMMARY_CHECK_INTERVAL,
  ONE_DAY,
  PERCENTAGE_OF_RECENT_MAIL,
  MINIMUM_IMPORTANT_ODDS,
  LAST_SUMMARY_KEY,
  GEN_REPLY_CMD,
  GEN_SUMMARY_CMD,
  REGEN_SUMMARY_CMD,
  GET_BANNER_CMD,
  GET_CURRENT_MSG_CMD,
  RELOAD_CONTENT_SCRIPT,
  DEFAULT_REMOTE_HANDOFF,
  OPEN_OPTIONS_CMD,
  REMOTE_HANDOFF_CACHE_KEY,
  REMOVE_CONTENT_SCRIPT,
  LOG_ERROR_CMD,
  GET_ENABLED_ACCOUNT_CMD,
  SEND_FEEDBACK,
  FEEDBACK_EMAIL,
  FEEDBACK_SUBJECT,
  ENABLED_ACCOUNTS_CACHE_KEY,
} from '@/const';
import { settingsStorage } from '@/storage';

let activeAccountId = '';
const properties = {
  title: 'Assist',
  url: 'index.html',
};

const storage = new AssistStorage(localStorage);
let scheduler: SummaryScheduler;
let summaryTab: browser.tabs.Tab | null = null;

let summaryInterval: ReturnType<typeof setInterval>;

let classifier: ImportanceClassifier;
const accountsMap = new Map<string, messenger.accounts.MailAccount>();

let registeredContentScript:
  | browser.messageDisplayScripts.RegisteredMessageDisplayScript
  | undefined;

/**
 * Populate the accounts map with the accounts and their identities. * Allows for quick lookup of accounts by id or email.
 */
async function populateAccountsMap() {
  const accounts = await messenger.accounts.list(true);
  for (const acc of accounts) {
    const identity = acc.identities[0];
    if (identity && identity.email) {
      accountsMap.set(acc.id, acc);
      accountsMap.set(identity.email, acc);
    }
  }
}

/**
 * Finds the EmailAddress for an account id.
 *
 * @param {string} accountId - The account id to look up in the accounts map.
 * @returns {EmailAddress} - The EmailAddress associated with the account id.
 */
function accountLookup(accountId: string): EmailAddress {
  const account = accountsMap.get(accountId);
  if (account) {
    return { address: account.identities[0].email!, name: account.identities[0].name! };
  }
  return { address: '', name: '' };
}

/**
 * Given an account id, returns important emails from the last 24 hours.
 * "Importance" is determined by a simple bayesian classifier trained using the "Important" and "Later" tags.
 *
 * @param {string} accountId - The account id to get important emails for.
 * @returns {Promise<EmailMessageWithPrediction[]>} - A promise that resolves to an array of important emails including the importance prediction
 * @throws {ClassifierError} When the classifier fails to generate a score for a message
 */
async function getImportantEmails(accountId?: string): Promise<EmailMessageWithPrediction[]> {
  if (!accountId) {
    accountId = activeAccountId;
  }

  logger.info(`Analyzing activeAccountId: ${accountId}`);

  const inboxEmails = await getMessagesWithBody(MESSAGE_TYPE.INBOX, accountId, ONE_DAY);
  if (inboxEmails.length === 0) {
    logger.info(`No emails from the past ONE_DAY`);
    return [];
  }
  logger.info(`Will calculate importance of ${inboxEmails.length} emails from inbox`);

  const sentMessages = await getMessageHeaders(MESSAGE_TYPE.SENT, accountId);
  const taggedImportant = await getMessagesWithBody(MESSAGE_TYPE.IMPORTANT);
  const taggedLater = await getMessagesWithBody(MESSAGE_TYPE.LATER);

  if (taggedImportant.length === 0) {
    throw new ClassifierError(
      `Please tag some important messages with "${MESSAGE_TYPE.IMPORTANT}" tag`
    );
  }
  if (taggedLater.length === 0) {
    throw new ClassifierError(
      `Please tag some important messages with "${MESSAGE_TYPE.LATER}" tag`
    );
  }

  const addressBookEmails = await getAddressBookEmailArray();

  // Generate frequency maps for:
  // addresses I have sent messages to
  const sentRecipientFreqMap: FrequencyMap = frequencyMapForMessages(sentMessages, 'recipients');
  // addresses sending me important messags
  const importantAuthorFreqMap: FrequencyMap = frequencyMapForMessages(taggedImportant, 'author');
  // addresses sending me unimportant messages
  const laterAuthorFreqMap: FrequencyMap = frequencyMapForMessages(taggedLater, 'author');

  // Merge the starred and sent message frequency maps.
  const combinedImportantSenderFreqMap = new Map(importantAuthorFreqMap);
  sentRecipientFreqMap.forEach((value, key) => {
    if (combinedImportantSenderFreqMap.has(key)) {
      combinedImportantSenderFreqMap.set(key, combinedImportantSenderFreqMap.get(key)! + value);
    } else {
      combinedImportantSenderFreqMap.set(key, value);
    }
  });

  const addressConfiguration: AddressConfiguration = {
    addressBookEmails,
    classificationFrequencyMap: {
      [CLASSIFICATION.IMPORTANT]: combinedImportantSenderFreqMap,
      [CLASSIFICATION.NOT_IMPORTANT]: laterAuthorFreqMap,
    },
  };

  // We only train on starred and junk messages.
  // Training on sent messages would match the user's writing,
  // which is not what we want.
  await classifier.trainBalanced(
    {
      [CLASSIFICATION.IMPORTANT]: taggedImportant,
      [CLASSIFICATION.NOT_IMPORTANT]: taggedLater,
    },
    addressConfiguration
  );

  const importantEmails = [];
  for (const message of inboxEmails) {
    const emailWithPrediction = classifier.getScore(message);
    if (emailWithPrediction.odds && emailWithPrediction.odds.IMPORTANT > MINIMUM_IMPORTANT_ODDS) {
      importantEmails.push(emailWithPrediction);
    }
  }
  importantEmails.sort((a, b) => {
    if (!(a.odds && b.odds)) {
      throw new Error('No odds found for email.');
    }
    return Math.abs(b.odds.IMPORTANT) - Math.abs(a.odds.IMPORTANT);
  });

  const howMany = Math.ceil(inboxEmails.length * (PERCENTAGE_OF_RECENT_MAIL / 100));
  logger.info(`Will use at most, ${howMany} out of ${inboxEmails.length} emails.`);
  logger.info(`There are ${importantEmails.length} important emails`);
  const topImportantEmails = importantEmails.slice(0, Math.ceil(howMany));
  logger.info(`getImportantEmails: Returning ${topImportantEmails.length} top emails`);
  return topImportantEmails;
}

/**
 * Changes format of author and recipient objects to strings containing only the email address strings.
 *
 * @param {EmailMessage[]} emails - Array of EmailMessage
 * @returns {EmailMessage[]} - Array of EmailMessage with author and recipient fields formatted as strings
 */
function formatEmails(emails: EmailMessage[]) {
  return emails.map((email) => ({
    ...email,
    author: email.author.address,
    recipient: email.recipients.map((recipient) => recipient.address).join(', '),
  }));
}

/**
 * Generates a summary JSON object for the given raw emails. The recipient's name and email address are used in the prompt for the LLM.
 *
 * @param {EmailMessage[]} rawEmails - The array of raw email messages to summarize.
 * @param {string} [recipientEmail=''] - The email address of the recipient.
 * @param {string} [recipientName=''] - The name of the recipient.
 * @returns {Promise<SummaryResponse>} - A promise that resolves to a summary response object.
 */
async function getSummaryJson(
  rawEmails: EmailMessage[],
  recipientEmail = '',
  recipientName = ''
): Promise<SummaryResponse> {
  const summaryModel = new SummaryModel();
  const formattedEmails = formatEmails(rawEmails);
  const summaryResponse = await summaryModel.summarize(
    formattedEmails,
    recipientEmail,
    recipientName
  );

  return summaryResponse;
}

/**
 *
 * @returns { string } A JSON object with the most recent summary, or an empty object if there is no previous summary.
 */
function getPreviousSummary(activeAccountId: string) {
  const key = `${LAST_SUMMARY_KEY}/${activeAccountId}`;
  const jsonString = storage.loadFromStorage(key) || '{}';
  return JSON.parse(jsonString);
}

/**
 * Retrieves a list of inboxes, excluding Local Folders.
 *
 * @returns {Promise<{id: string, email: string}[]>} - A promise that resolves to an array of objects containing the id and email of each inbox.
 */
async function getInboxes() {
  const inboxes = Array.from(accountsMap.entries())
    .filter(([key]) => key.includes('@'))
    .map(([key, account]) => ({ id: account.id, email: key }));
  return inboxes;
}

/**
 * Handles various requests sent to the background script.
 *
 * @param {Record<string, any>} request - The request object containing the action and any necessary payload.
 * @param {messenger.runtime.MessageSender} sender - The request of the sender, optional.
 * @returns {Promise<any>} - A promise that resolves to the response of the handled request.
 */
// TODO: create a type for the return value.
export async function handleRequest(
  request: Record<string, any>,
  sender?: messenger.runtime.MessageSender
) {
  if (request.action === 'getPreviousSummary') {
    if (request.accountId) {
      activeAccountId = request.accountId;
    }
    const prevSummary = getPreviousSummary(activeAccountId);
    console.log(`Previous summary requested. Sending the following:`);
    console.log(prevSummary);
    return prevSummary;
  }
  if (request.action === 'getSummary') {
    const startTime = new Date().getTime();
    let error = '';

    if (request.accountId) {
      activeAccountId = request.accountId;
    }

    const { name, address } = accountLookup(activeAccountId);
    let emails: EmailMessageWithPrediction[] = [];
    try {
      emails = await getImportantEmails(activeAccountId);
    } catch (e) {
      console.log(e);
      error = (e as ClassifierError).message;
    }
    if (emails.length === 0) {
      logger.info(`request.action === 'getSummary': got 0 emails from getImportantEmails`);
      return {
        summary: 'No emails to summarize',
        duration: 0,
        error,
      };
    }
    const summary = await getSummaryJson(emails, address, name);
    const endTime = new Date().getTime();
    const duration = (endTime - startTime) / 1000;

    const summaryResponseJson = JSON.stringify(summary);
    const key = `${LAST_SUMMARY_KEY}/${activeAccountId}`;
    storage.saveToStorage(key, summaryResponseJson);

    metrics.capture('dailybrief_generate', {
      length: emails.length,
      duration,
      error,
    });
    return {
      ...summary,
      duration,
      error,
    };
  }

  if (request.action === 'captureMetrics') {
    metrics.capture(request.payload);
  }

  if (request.action === 'getInboxes') {
    const folders = await getInboxes();
    return folders;
  }

  if (request.action === 'registerTab') {
    properties.url = request.payload;
    return true;
  }

  if (request.action === OPEN_OPTIONS_CMD) {
    try {
      await messenger.runtime.openOptionsPage();
    } catch (error) {
      console.error('Failed to open Add-ons Manager:', error);
    }
    return true;
  }

  if (request.action === 'setLastSummaryTime') {
    const lastRun = request.payload;

    logger.info(`
Setting last run time to ${lastRun}

  `);

    scheduler.setLastRun(lastRun);
    scheduler.storeTimestamp();
    return true;
  }

  if (request.action === 'getIsTimeToRun') {
    return scheduler.isTimeToRun();
  }

  if (request.action === 'clearLastSummaryTime') {
    scheduler.clearTimestamp();
    return true;
  }

  if (request.action === 'openLoginPopup') {
    const popupId = await createLoginPopup(request.url);
    return await new Promise((resolve) => {
      const checkPopupClosed = (windowId: number) => {
        if (windowId === popupId) {
          browser.windows.onRemoved.removeListener(checkPopupClosed);
          resolve({
            popup: 'closed',
          });
        }
      };

      browser.windows.onRemoved.addListener(checkPopupClosed);
    });
  }
  if (request.action === RELOAD_CONTENT_SCRIPT) {
    await registerMessageDisplayScripts(true);
    return null;
  }
  if (request.action === REMOVE_CONTENT_SCRIPT) {
    await removeMessageDisplayScripts();
    return null;
  }

  if (request.action === LOG_ERROR_CMD) {
    console.error(request.errorContent);
    return null;
  }

  if (!(sender && sender.tab && sender.tab.id)) return null;
  const messageHeader = await messenger.messageDisplay.getDisplayedMessage(sender.tab.id);
  if (!messageHeader) return null;
  const { id } = messageHeader;
  if (id) {
    if (request.action === SEND_FEEDBACK) {
      await sendFeedback(id, request.summary, request.rating);
      return null;
    }
    if (request.action === GEN_REPLY_CMD) {
      metrics.capture('reply_generate');
      return await getReplyById(id);
    }
    if (request.action === GEN_SUMMARY_CMD) {
      metrics.capture('summary_generate');
      return await getSummaryById(id, false, sender.tab.id);
    }
    if (request.action === REGEN_SUMMARY_CMD) {
      metrics.capture('summary_regenerate');
      return await getSummaryById(id, true, sender.tab.id);
    }
    if (request.action === GET_BANNER_CMD) {
      return getBanner(id);
    }
    if (request.action === GET_CURRENT_MSG_CMD) {
      return id;
    }

    if (request.action === GET_ENABLED_ACCOUNT_CMD) {
      const message = await messenger.messages.get(id);
      if (message && message.folder) {
        const accountId = message.folder.accountId;
        const settings = await settingsStorage.get();

        const enabledAccountIds = settings[ENABLED_ACCOUNTS_CACHE_KEY];

        if (enabledAccountIds.includes(accountId)) {
          return true;
        }
      }
      return false;
    }
  }
  return null;
}

async function createLoginPopup(url: string) {
  const popup = await browser.windows.create({
    url,
    type: 'popup',
    allowScriptsToClose: true,
  });

  return popup.id!;
}
/**
 * Creates a new summary tab if one does not already exist.
 * The summary tab contains the Vue.js application.
 * Once the tab is closed, it sets the summaryTab variable to null.
 */
async function createSummaryTab() {
  if (summaryTab) {
    // Do not create more than one summary tab.
    return;
  }

  summaryTab = await messenger.tabs.create({
    url: properties.url,
  });

  const checkSummaryTabClosed = (id: number) => {
    if (id === summaryTab?.id) {
      summaryTab = null;
      browser.tabs.onRemoved.removeListener(checkSummaryTabClosed);
    }
  };
  browser.tabs.onRemoved.addListener(checkSummaryTabClosed);
}

/**
 *
 * Focus on the summary tab, if it exists
 */
async function focusSummaryTab() {
  if (summaryTab) {
    // If the summary tab already exists, focus on it
    await browser.tabs.update(summaryTab.id!, { active: true });
    return true;
  }

  return false;
}

async function focusOrCreateSummaryTab() {
  (await focusSummaryTab()) || createSummaryTab();
}

async function getExistingSummaryTab() {
  let tabs = await messenger.tabs.query();
  if (tabs && tabs.length > 0) {
    tabs = tabs.filter((t) => {
      if (!t) {
        return false;
      }

      const { title, url } = t;
      if (title === undefined || url == undefined) {
        return false;
      }

      const isAssist = title.toLowerCase().includes('assist') && url.endsWith('index.html');
      return isAssist;
    });

    if (tabs.length > 0) {
      summaryTab = tabs[0];
    }
  }
}

/**
 * Starts an interval that checks if it's time to open the summary tab.
 */
function openTabOnSchedule() {
  if (!summaryInterval) {
    summaryInterval = setInterval(() => {
      // If it's time to run, attempt to create a summary tab
      if (scheduler.isTimeToRun()) {
        createSummaryTab();
      }
    }, SUMMARY_CHECK_INTERVAL);
  }
}

async function registerMessageDisplayScripts(replace: boolean = false) {
  if (registeredContentScript) {
    if (!replace) {
      return;
    }
    registeredContentScript.unregister();
  }

  if (await getFlwrApiKey()) {
    registeredContentScript = await browser.messageDisplayScripts.register({
      js: [{ file: './banner.js' }],
      css: [{ file: './banner.css' }],
    });
  } else {
    registeredContentScript = undefined;
  }
}

async function sendFeedback(id: number, originalSummary: string, rating: 'good' | 'bad') {
  const { emailBody } = await fetchEmailBodyAndHash(id);
  const composeDetails = {
    to: FEEDBACK_EMAIL,
    subject: FEEDBACK_SUBJECT,
    plainTextBody: `
- Original email

\`\`\`
${emailBody}
\`\`\`

- Original summary

\`\`\`
${originalSummary}
\`\`\`

- User rating

\`\`\`
${rating}
\`\`\`

- Suggested summary

\`\`\`
${originalSummary}
\`\`\`

`,
    isPlainText: true,
  };
  await browser.compose.beginNew(composeDetails);
}

async function provideDefaultOptionValues() {
  // Guard against a missing RemoteHandoff setting.
  const remoteCacheRes = await browser.storage.local.get(REMOTE_HANDOFF_CACHE_KEY);

  // This checks to see if it's missing, entirely.
  // Without this, Assist will default to local inference, which
  // can make slower machines unresponsive.
  if (!(REMOTE_HANDOFF_CACHE_KEY in remoteCacheRes)) {
    await browser.storage.local.set({
      [REMOTE_HANDOFF_CACHE_KEY]: DEFAULT_REMOTE_HANDOFF,
    });
  }
}

async function removeMessageDisplayScripts() {
  if (registeredContentScript) {
    registeredContentScript.unregister();
    registeredContentScript = undefined;
  }
}

// Listen for new emails and generate summaries in the background
messenger.messages.onNewMailReceived.addListener(summarizeOnReceive);

async function main() {
  console.clear();
  metrics.init();

  await getExistingSummaryTab();

  await provideDefaultOptionValues();

  const { default: model } = await import(
    'https://cdn.jsdelivr.net/npm/wink-eng-lite-web-model@1.8.1/+esm'
  );

  // @ts-ignore
  classifier = new ImportanceClassifier(model);

  await registerMessageDisplayScripts(true);

  scheduler = new SummaryScheduler(storage);
  await populateAccountsMap();

  messenger.runtime.onMessage.addListener(handleRequest);

  await createSummaryTab();
  // Start regular check to open a tab if it's time to get a summary
  openTabOnSchedule();

  // Allow user to click button to open Assist
  browser.browserAction.onClicked.addListener(focusOrCreateSummaryTab);
}

if (import.meta.env.MODE !== 'test') {
  main();
}
