import { getDailyBrief } from '@/lib/flowerUtils';
import {
  SUMMARY_CATEGORIES,
  CATEGORY_ACTION,
  CATEGORY_HIGHLIGHT,
  CATEGORY_MISC,
  FAILED_SUMMARY,
} from '@/const';

export type DailyBrief = {
  [CATEGORY_ACTION]: EmailSummary[];
  [CATEGORY_HIGHLIGHT]: EmailSummary[];
  [CATEGORY_MISC]: EmailSummary[];
};

export type EmailSummary = {
  author: string;
  summary: string;
  headerMessageId: string;
};

export type SummaryResponse = {
  summary: DailyBrief;
  tokenCount?: number;
  error?: string;
};

const EMPTY_SUMMARY = {
  [CATEGORY_ACTION]: [],
  [CATEGORY_HIGHLIGHT]: [],
  [CATEGORY_MISC]: [],
};

function trimCategoryFromSummary(e: EmailSummary): EmailSummary {
  for (const category of SUMMARY_CATEGORIES) {
    e.summary = e.summary.replace(`[${category}]`, '').trim();
  }
  return e;
}

function formatSummariesAsDailyBrief(responses: EmailSummary[]): DailyBrief {
  const brief: DailyBrief = {
    [CATEGORY_ACTION]: [],
    [CATEGORY_HIGHLIGHT]: [],
    [CATEGORY_MISC]: [],
  };
  for (const resp of responses) {
    if (resp && resp.summary) {
      const emailSummary: EmailSummary = {
        author: resp.author,
        summary: resp.summary,
        headerMessageId: resp.headerMessageId,
      };
      for (const category of SUMMARY_CATEGORIES) {
        if (emailSummary.summary.startsWith(`[${category}]`)) {
          const categoryKey = category as keyof DailyBrief;
          brief[categoryKey].push(trimCategoryFromSummary(emailSummary));
        }
      }
    }
  }
  return brief;
}

function generateRole(name: string, email: string) {
  return `You are an executive assistant working for a busy executive. Your task is to summarize email messages for your boss whose name is ${name} and whose email address is ${email}. You are eager for a promotion and want to impress them.`;
}

const mainPrompt = `Analyze the following email. Categorize it as "action", "highlight", or "miscellaneous".
"action" means it the recipient needs to take action or provide a response.
"highlight" means it has important information, but needs no action or response.
"miscellaneous" means it might contain key information that may be useful at another time.

Respond with a single line, formatted like so:
[category] clear description of action or a short summary of important information.

For example, for an "action" email about holiday bonuses, you would format your single line response like so:
[action] <author of email> asked about a decision regarding holiday bonuses. You need to reply by end of day Nov. 26.

Do not include reasons for categorizing the email or any additional information.


Here is the email:
`;

function emailToString(message: Record<string, any>) {
  const { author, date, ccList, recipient, recipients, body } = message;
  const emailObj = {
    author,
    date,
    ccList,
    recipient,
    recipients,
    body,
  };
  const emailString = JSON.stringify(emailObj);
  return emailString;
}

async function summarizeOne(message: Record<string, any>, recipientEmail = '', recipientName = '') {
  try {
    const chatMessages = [
      { role: 'system', content: generateRole(recipientName, recipientEmail) },
      { role: 'user', content: mainPrompt },
      { role: 'user', content: emailToString(message) },
    ];
    return await getDailyBrief(chatMessages);
  } catch (e) {
    return null;
  }
}

export default class SummaryModel {
  async summarize(
    messages: Record<string, any>[],
    recipientEmail = '',
    recipientName = ''
  ): Promise<SummaryResponse> {
    if (messages.length === 0) {
      return {
        summary: EMPTY_SUMMARY,
      };
    }

    const allSummaryPromises = messages.map(async (message) => {
      const { headerMessageId, author } = message as Record<string, string>;
      const response = await summarizeOne(message, recipientEmail, recipientName);
      if (response) {
        return {
          summary: response,
          headerMessageId,
          author,
        };
      }
      return null;
    });
    let results = await Promise.all(allSummaryPromises);
    results = results.filter((result): result is EmailSummary => {
      return result !== null;
    });

    if (results === null || results.length === 0) {
      return {
        summary: EMPTY_SUMMARY,
        error: `${FAILED_SUMMARY}`,
      };
    }
    return {
      summary: formatSummariesAsDailyBrief(results as EmailSummary[]),
    };
  }
}
