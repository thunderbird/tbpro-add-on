/// <reference path="../types/flwr.d.ts" />

import {
  SUMMARY_PROMPT_CACHE_KEY,
  REPLY_CACHE_KEY,
  SUMMARY_CACHE_KEY,
  DEFAULT_SUMMARY_PROMPT,
  DEFAULT_REPLY_PROMPT,
  FAILED_SUMMARY,
  FAILED_SUMMARY_ENCRYPTED,
  NO_SUMMARY_AVAILABLE,
  REMOTE_HANDOFF_CACHE_KEY,
  FI_URL,
  ENCRYPTED_SUMMARY_CACHE_KEY,
  FI_DEFAULT_MODEL,
} from '@/const';
import { getMessageBodyAndEncryptionStatus } from '@/lib/Messages';
import { settingsStorage } from '@/storage';
import { logger } from '@thunderbirdops/services-utils';
import { parse } from 'marked';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let cachedFlowerModule: Promise<{ FlowerIntelligence: any }> | null = null;

function getFlowerIntelligenceModule() {
  if (!cachedFlowerModule) {
    cachedFlowerModule = import(FI_URL);
  }
  return cachedFlowerModule;
}

async function computeHash(text: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function getCachedValue(cacheKey: string): Promise<string | null> {
  const storedData = await messenger.storage.local.get(cacheKey);
  return (storedData[cacheKey] as string) || null;
}

export async function fetchEmailBodyAndHash(id: number) {
  let emailHash: string | null = null;
  const { body, isEncrypted } = await getMessageBodyAndEncryptionStatus(id);

  if (body) {
    emailHash = await computeHash(body);
    return { emailBody: body, emailHash, encrypted: isEncrypted };
  }

  return { emailBody: null, emailHash: null, encrypted: isEncrypted };
}

async function getPrompt(cacheKey: string, defaultPrompt: string) {
  const settings = await settingsStorage.get();
  // temporarily using defaultPrompt exclusively
  const cachedPrompt = settings[defaultPrompt];
  return (cachedPrompt as string | undefined) ?? defaultPrompt;
}

export async function getFlwrApiKey() {
  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/auth/stat`, {
      mode: 'cors',
      credentials: 'include', // include cookies
    });
    const data = await resp.json();
    if (data.uid && data.email && data.flwr_api_key) {
      return data.flwr_api_key;
    }
  } catch (error) {
    logger.error(error);
  }
}

async function getRemoteHandoff() {
  const settings = await settingsStorage.get();
  const remoteHandoff = settings[REMOTE_HANDOFF_CACHE_KEY];
  if (!(remoteHandoff === null || remoteHandoff === undefined)) {
    const { FlowerIntelligence } = await getFlowerIntelligenceModule();
    const fi = FlowerIntelligence.instance;
    fi.remoteHandoff = remoteHandoff as boolean;
    if (fi.remoteHandoff) {
      const apiKey = await getFlwrApiKey();
      if (!apiKey) {
        return;
      }
      fi.apiKey = apiKey;
    }
  }
}

export async function getDailyBrief(
  chatMessages: {
    role: string;
    content: string;
  }[]
) {
  await getRemoteHandoff();
  const { FlowerIntelligence } = await getFlowerIntelligenceModule();
  const fi = FlowerIntelligence.instance;
  fi.remoteHandoff = true;
  const response = await fi.chat({
    model: FI_DEFAULT_MODEL,
    messages: chatMessages,
    encrypt: true,
    forceRemote: true,
  });
  if (!response.ok) {
    console.error(response.failure.description);
    return null;
  } else {
    return response.message.content;
  }
}

async function saveSummaryById(id: number, summary: string) {
  const { emailBody, emailHash, encrypted } = await fetchEmailBodyAndHash(id);
  if (encrypted) {
    const settings = await settingsStorage.get();
    const allowEncryptedSummaries = settings[ENCRYPTED_SUMMARY_CACHE_KEY];

    if (!allowEncryptedSummaries) {
      return { summary: FAILED_SUMMARY_ENCRYPTED };
    }
  }
  if (!emailBody) return { summary: FAILED_SUMMARY };

  const cacheKey = `${SUMMARY_CACHE_KEY}-${emailHash}`;
  await messenger.storage.local.set({ [cacheKey]: summary });
}

export async function getSummaryById(id: number, regenerate: boolean, senderId?: number) {
  await getRemoteHandoff();
  const { emailBody, emailHash, encrypted } = await fetchEmailBodyAndHash(id);
  if (encrypted) {
    const settings = await settingsStorage.get();
    const allowEncryptedSummaries = settings[ENCRYPTED_SUMMARY_CACHE_KEY];

    if (!allowEncryptedSummaries) {
      return { summary: FAILED_SUMMARY_ENCRYPTED };
    }
  }
  if (!emailBody) return { summary: FAILED_SUMMARY };

  const cacheKey = `${SUMMARY_CACHE_KEY}-${emailHash}`;
  const storedSummary = await getCachedValue(cacheKey);

  if (!regenerate && storedSummary) {
    return { summary: storedSummary };
  }

  const summaryPrompt = await getPrompt(SUMMARY_PROMPT_CACHE_KEY, DEFAULT_SUMMARY_PROMPT);
  const { FlowerIntelligence } = await getFlowerIntelligenceModule();
  const fi = FlowerIntelligence.instance;
  fi.remoteHandoff = true;
  const stream = !(senderId === undefined);
  const response = await fi.chat({
    model: FI_DEFAULT_MODEL,
    messages: [
      { role: 'system', content: summaryPrompt },
      { role: 'user', content: emailBody },
    ],
    stream,
    onStreamEvent: (event: { chunk: string }) =>
      void (async () => {
        if (senderId) {
          await messenger.tabs.sendMessage(senderId, event);
        }
      })(),
    forceRemote: true,
    encrypt: true,
  });
  if (!response.ok) {
    console.error(response.failure.description);
  } else {
    await saveSummaryById(id, await parse(response.message.content ?? ''));
  }
}

export async function getReplyById(id: number) {
  await getRemoteHandoff();
  const { emailBody, encrypted } = await fetchEmailBodyAndHash(id);
  if (encrypted) {
    const settings = await settingsStorage.get();
    const allowEncryptedSummaries = settings[ENCRYPTED_SUMMARY_CACHE_KEY];

    if (!allowEncryptedSummaries) {
      return { summary: FAILED_SUMMARY_ENCRYPTED };
    }
  }
  if (!emailBody) return { reply: FAILED_SUMMARY };

  const replyPrompt = await getPrompt(REPLY_CACHE_KEY, DEFAULT_REPLY_PROMPT);
  const { FlowerIntelligence } = await getFlowerIntelligenceModule();
  const fi = FlowerIntelligence.instance;
  fi.remoteHandoff = true;
  const response = await fi.chat({
    model: FI_DEFAULT_MODEL,
    messages: [{ role: 'user', content: `${replyPrompt}\n${emailBody}` }],
    forceRemote: true,
    encrypt: true,
  });

  if (!response.ok) {
    console.error(response.failure.description);
  } else {
    let reply: string = response.message.content ?? '';

    // Begining of workaround until model consistently formats the reply.
    if (!reply.includes('<REPLY_END>')) {
      reply = `${reply}\n<REPLY_END>`;
      // Placeholder for logging/metrics:
      console.log(`Added <REPLY_END>`);
    } else {
      // Placeholder for logging/metrics:
      console.log(`Did not need to add <REPLY_END>`);
    }
    // End of workaround
    const match = /<REPLY_BEGIN>([\s\S]*?)<REPLY_END>/.exec(reply);
    if (match) {
      const composeDetails = {
        plainTextBody: match[1].trim(),
        isPlainText: true,
      };
      await browser.compose.beginReply(id, composeDetails);
      return { reply: reply };
    }
  }

  return { reply: FAILED_SUMMARY };
}

export async function summarizeOnReceive(
  _folder: messenger.folders.MailFolder,
  messages: messenger.messages.MessageList
) {
  if (await getFlwrApiKey()) {
    for (const message of messages.messages) {
      if ((message.date as Date).getTime() > Date.now() - ONE_WEEK_MS) {
        await getSummaryById(message.id, false);
      }
    }
  }
}

export async function getBanner(id: number) {
  const { emailBody, emailHash, encrypted } = await fetchEmailBodyAndHash(id);
  if (encrypted) {
    const settings = await settingsStorage.get();
    const allowEncryptedSummaries = settings[ENCRYPTED_SUMMARY_CACHE_KEY];

    if (!allowEncryptedSummaries) {
      return { text: FAILED_SUMMARY_ENCRYPTED, noSummary: true, encrypted: true };
    }
  }
  if (emailBody) {
    const cacheKey = `${SUMMARY_CACHE_KEY}-${emailHash}`;
    const storedSummary = await getCachedValue(cacheKey);
    if (storedSummary) {
      return { text: storedSummary, noSummary: false };
    }
  }
  return { text: NO_SUMMARY_AVAILABLE, noSummary: true };
}
