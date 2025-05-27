import { parseEmailAddress, type EmailAddress } from '@/lib/AddressBook';
import striptags from 'striptags';
import { settingsStorage } from '@/storage';
import { ENCRYPTED_SUMMARY_CACHE_KEY } from '@/const';

export enum MESSAGE_TYPE {
  INBOX = 'inbox',
  SENT = 'sent',
  JUNK = 'junk',
  FLAGGED = 'flagged',
  STARRED = 'flagged',
  IMPORTANT = 'Important', // Taken from default tag name
  LATER = 'Later', // Taken from default tag name
}

export type EmailMessage = {
  author: EmailAddress;
  body: string | null;
  ccList: EmailAddress[];
  date: Date;
  flagged: boolean;
  headerMessageId: string;
  id: number;
  recipients: EmailAddress[];
  subject: string;
};

export type QueryInfo = Record<string, any>;

/**
 *
 * @param {messenger.messages.MessagePart[]} parts - An Array of MessageParts
 * @returns {string} The plain text part of the message. If one does not exist, return the first available part.
 */
function extractPlaintextBody(parts: messenger.messages.MessagePart[]): string {
  if (parts.length > 0) {
    const part = parts[0];
    let body;
    if (part.parts) {
      const plainPart = parts.find((p) => p.contentType === 'text/plain');
      body = plainPart ? plainPart.body : part.parts[0].body;
    } else if (part.body) {
      body = part.body;
    }

    // Remove HTML tags and replace multiple line breaks with single ones.
    const cleanBody = striptags(body ?? '').replace(/\n{2,}|\n\r+/g, '\n');
    return cleanBody;
  }
  return '';
}

/**
 * An async generator that yields email messages from paginated results.
 *
 * @param {messenger.messages.MessageList} page - The initial page of messages to start from.
 * @yields {Promise<EmailMessage>} The next message from the paginated list.
 * @returns {AsyncGenerator<EmailMessage, void, unknown>} An async generator yielding `EmailMessage` objects.
 */
async function* _getRemainingMessagesGenerator(page: messenger.messages.MessageList) {
  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    for (const message of page.messages) {
      yield message;
    }
  }
}

/**
 *
 * @param {messenger.messages.MessageHeader[]} messageHeaders  - An array of headers for the full messages to retrieve.
 * @param {boolean} [requireBody] - If true, filter out any messages that have an empty body.
 * @returns {Promise<EmailMessage[]>} A promise that resolves to an array of email messages.
 */
export async function messageHeaderToEmailMessage(
  messageHeaders: messenger.messages.MessageHeader[],
  requireBody = true
): Promise<EmailMessage[]> {
  let fullMessages = await Promise.all(
    messageHeaders.map(async (msg) => {
      const author: EmailAddress = parseEmailAddress(msg.author);
      const ccList: EmailAddress[] = msg.ccList.map(parseEmailAddress);
      const date: Date = new Date(msg.date);
      const flagged: boolean = msg.flagged;
      const headerMessageId: string = msg.headerMessageId ?? '';
      const id: number = msg.id;
      const recipients: EmailAddress[] = msg.recipients.map(parseEmailAddress);
      const subject: string = msg.subject;
      let body = null;
      let isEncrypted = null;
      if (requireBody) {
        ({ body, isEncrypted } = await getMessageBodyAndEncryptionStatus(msg.id));
      }
      return {
        author,
        body,
        ccList,
        date,
        flagged,
        headerMessageId,
        id,
        recipients,
        subject,
        isEncrypted,
      };
    })
  );

  if (requireBody) {
    const settings = await settingsStorage.get();
    const allowEncryptedSummaries = settings[ENCRYPTED_SUMMARY_CACHE_KEY];
    if (allowEncryptedSummaries) {
      // Just make sure there's a body.
      fullMessages = fullMessages.filter(({ body }) => body);
    } else {
      fullMessages = fullMessages.filter(({ body, isEncrypted }) => body && !isEncrypted);
    }
  }

  if (fullMessages.length === 0) {
    // throw new Error('No messages to return from getFullMessages');
    console.warn('No messages to return from getFullMessages');
  }

  return fullMessages;
}

export async function getMessageBodyAndEncryptionStatus(id: number) {
  const fullMessage = await messenger.messages.getFull(id);
  let body = null;
  let isEncrypted = null;
  const { parts } = fullMessage;
  if (parts) {
    const bodyString = findBodyPart(parts);
    if (typeof bodyString === 'string') {
      body = removeLongUrls(bodyString);
    }
  }
  if (fullMessage.decryptionStatus) {
    isEncrypted = fullMessage.decryptionStatus !== 'none';
  }
  return { body, isEncrypted };
}

type MessageQueryOptions = {
  requireBody?: boolean;
  accountId?: string;
  maxHoursOld?: number;
};

// Copied from fi-extension/src/utils.ts
// TODO: import after combining the various utils
function removeLongUrls(text: string, maxLength = 50): string {
  // Regular expression to match URLs (starting with http:// or https://)
  const urlRegex = /https?:\/\/[^\s]+/g;

  // Replace URLs longer than the specified length
  return text.replace(urlRegex, (url) => {
    return url.length > maxLength ? '' : url;
  });
}

/**
 * Recursively searches for the best plain text and HTML body parts.
 * It prioritizes content within 'multipart/alternative' parts.
 * @param parts The list of MessageParts to search.
 * @returns An object containing the found plainBody (string) and htmlBody (string), if any.
 */
function findTextBodiesRecursive(parts: messenger.messages.MessagePart[]): {
  plainBody?: string;
  htmlBody?: string;
} {
  let bestPlainBody: string | undefined;
  let bestHtmlBody: string | undefined;

  // First, check if there's a 'multipart/alternative' part at this level.
  // If so, its children are the primary candidates.
  const alternativePart = parts.find(
    (p) => p.contentType === 'multipart/alternative' && p.parts && p.parts.length > 0
  );

  if (alternativePart && alternativePart.parts) {
    // Search within the 'multipart/alternative' part's children.
    // These are direct alternatives for the same content.
    for (const part of alternativePart.parts) {
      if (part.contentType === 'text/plain' && part.body) {
        if (!bestPlainBody) {
          // Take the first one found
          bestPlainBody = part.body;
        }
      } else if (part.contentType === 'text/html' && part.body) {
        if (!bestHtmlBody) {
          // Take the first one found
          bestHtmlBody = part.body;
        }
      } else if (part.contentType === 'multipart/related' && part.parts && part.parts.length > 0) {
        // HTML part might be nested inside multipart/related (e.g., for inline images)
        // This is common within a multipart/alternative structure.
        const relatedResult = findTextBodiesRecursive(part.parts);
        if (!bestHtmlBody && relatedResult.htmlBody) {
          bestHtmlBody = relatedResult.htmlBody;
        }
        // It's less common for plain text to be in multipart/related, but check just in case.
        if (!bestPlainBody && relatedResult.plainBody) {
          bestPlainBody = relatedResult.plainBody;
        }
      }
      // If we found both plain and HTML within alternative, we can stop for this alternative block.
      if (bestPlainBody && bestHtmlBody) break;
    }
    // If we found bodies within multipart/alternative, these are generally the ones to use.
    if (bestPlainBody || bestHtmlBody) {
      return { plainBody: bestPlainBody, htmlBody: bestHtmlBody };
    }
  }

  // If no 'multipart/alternative' was found at this level, or it yielded no text bodies,
  // search through all parts at the current level and recurse.
  for (const part of parts) {
    if (part.contentType === 'text/plain' && part.body) {
      if (!bestPlainBody) {
        bestPlainBody = part.body;
      }
    } else if (part.contentType === 'text/html' && part.body) {
      if (!bestHtmlBody) {
        bestHtmlBody = part.body;
      }
    } else if (
      part.parts &&
      part.parts.length > 0 &&
      part.contentType !== 'multipart/alternative'
    ) {
      // Recurse into other multipart types (e.g., mixed, related outside of alternative)
      const nestedResult = findTextBodiesRecursive(part.parts);
      if (!bestPlainBody && nestedResult.plainBody) {
        bestPlainBody = nestedResult.plainBody;
      }
      if (!bestHtmlBody && nestedResult.htmlBody) {
        bestHtmlBody = nestedResult.htmlBody;
      }
    }
    // If searching outside an 'alternative' block, we continue searching all parts at this level
    // to ensure we find any available text, as their order might not imply preference.
  }

  return { plainBody: bestPlainBody, htmlBody: bestHtmlBody };
}

/**
 * Extracts the most suitable email body as a string from the message parts.
 * It recursively searches for text/plain and text/html parts, then decides
 * which to use based on availability and content length. HTML is converted to plain text.
 *
 * @param initialParts The array of MessagePart objects from messenger.messages.getFull().parts.
 * @returns The extracted email body as a string, or an empty string if no suitable body is found.
 */
export function findBodyPart(initialParts: messenger.messages.MessagePart[]): string {
  if (!initialParts || initialParts.length === 0) {
    return '';
  }

  const { plainBody, htmlBody } = findTextBodiesRecursive(initialParts);

  let shouldUseHtml = false;

  // Use the HTML body if there is no plaintext body
  if (!plainBody && htmlBody) {
    shouldUseHtml = true;
  } else if (htmlBody && plainBody) {
    // Use the HTML body if it's significantly longer (user's original heuristic)
    if (htmlBody.length > plainBody.length * 100) {
      shouldUseHtml = true;
    }
    // Add a common preference: if both HTML and plain text are available (often from multipart/alternative),
    // many clients prefer HTML by default, unless it's trivial.
    // However, sticking to your original preference logic:
    // If the above length check doesn't make HTML preferred, plain text is chosen if available.
  }

  if (shouldUseHtml && htmlBody) {
    try {
      // Ensure DOMParser is available in the Thunderbird extension environment.
      // It's a standard Web API, so it should be.
      const doc = new DOMParser().parseFromString(htmlBody, 'text/html');
      const convertedPlaintext = (doc.body.textContent || '').trim();

      // If HTML conversion results in an empty string, but we have a plainBody, prefer plainBody.
      if (convertedPlaintext.length > 0) {
        return convertedPlaintext;
      } else if (plainBody) {
        return plainBody;
      }
      // If HTML conversion is empty and no plainBody, return empty string.
      return '';
    } catch (e) {
      console.error('Error parsing HTML body:', e);
      // Fallback to plaintext if HTML parsing fails and plaintext is available
      if (plainBody) {
        return plainBody;
      }
      return ''; // Or return raw HTML if no plaintext? The goal is a usable string.
    }
  } else if (plainBody) {
    // Fall back to plaintext body
    return plainBody;
  }

  // Could not find anything suitable.
  return '';
}

/**
 * Fetches an array of email messages based on the specified message type, account, and optional time range.
 *
 * @param {MESSAGE_TYPE} messageType - The type of messages to retrieve (e.g., 'INBOX', 'SENT', 'JUNK', 'STARRED').
 * @param {string} [accountId] - The ID of the account to retrieve messages from. If omitted, messages for the first account will be returned.
 * @param {number} [maxHoursOld] - The maximum age of the messages to retrieve, in hours. If omitted, all messages are returned. Warning: this could increase retrieval time significantly.
 * @returns {Promise<EmailMessage[]>} A promise that resolves to an array of email messages sorted by date in descending order.
 */
async function searchForMessages(messageType: MESSAGE_TYPE, options?: MessageQueryOptions) {
  const queryParams: QueryInfo = {};

  // Searches by tags span all folders for an account.
  // All other searches are within a single folder.
  const isTaggedImportantQuery = messageType === MESSAGE_TYPE.IMPORTANT;
  const isTaggedLaterQuery = messageType === MESSAGE_TYPE.LATER;

  const { requireBody = true, accountId, maxHoursOld } = options ?? {};

  if (isTaggedImportantQuery || isTaggedLaterQuery) {
    // @ts-ignore: the `isTag` is valid, but my typings don't know that
    const tagFolders = await messenger.folders.query({ isTag: true });
    const folder = tagFolders.find((folder) => folder.name === messageType);
    if (folder) {
      queryParams.folderId = folder.id;
    }
    // Note: do *not* include the account id in the `queryParams`
    // Tag folders don't belong to an account, and will cause an empty result
  } else {
    // For folder-based queries, we first get the
    // corresponding folder.
    const folderQuery: QueryInfo = {
      specialUse: [messageType],
    };

    if (accountId) {
      folderQuery.accountId = accountId;
    }

    const [folder] = await messenger.folders.query(folderQuery);
    if (!folder) {
      throw new Error(`Could not find a matching folder`);
    }

    queryParams.folder = folder;
  }

  if (maxHoursOld) {
    const fromDate = new Date(new Date().getTime() - maxHoursOld * 60 * 60 * 1000);
    queryParams.fromDate = fromDate;
  }
  const messageList = (await messenger.messages.query(
    queryParams
  )) as messenger.messages.MessageList;
  const { messages: messageHeaders } = messageList;
  if (!maxHoursOld) {
    // Be careful with this - if the user has *a lot*
    // of emails, this could take a while.
    const seen: Record<string, boolean> = {};
    for await (const header of _getRemainingMessagesGenerator(messageList)) {
      // The same message may appear multiple times.
      // We only want uniques.
      if (!seen[header.headerMessageId]) {
        seen[header.headerMessageId] = true;
        messageHeaders.push(header);
      }
    }
  }

  // Sort the messages in-place by date in descending order.
  messageHeaders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return messageHeaderToEmailMessage(messageHeaders, requireBody);
}

export async function getMessagesWithBody(
  messageType: MESSAGE_TYPE,
  accountId?: string,
  maxHoursOld?: number
) {
  return await searchForMessages(messageType, {
    requireBody: true,
    accountId,
    maxHoursOld,
  });
}

export async function getMessageHeaders(
  messageType: MESSAGE_TYPE,
  accountId?: string,
  maxHoursOld?: number
) {
  return await searchForMessages(messageType, {
    requireBody: false,
    accountId,
    maxHoursOld,
  });
}
