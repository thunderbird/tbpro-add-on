import {
  FAILED_SUMMARY,
  FAILED_SUMMARY_ENCRYPTED,
  FEEDBACK_DISCLAIMER,
  GEN_REPLY_CMD,
  GEN_SUMMARY_CMD,
  GET_BANNER_CMD,
  GET_CURRENT_MSG_CMD,
  GET_ENABLED_ACCOUNT_CMD,
  LOG_ERROR_CMD,
  NO_SUMMARY_AVAILABLE,
  OPEN_OPTIONS_CMD,
  REGEN_SUMMARY_CMD,
  SEND_FEEDBACK,
} from '@/const';
import {
  FLWR_ICON,
  GEN_ICON,
  GEN_ICON_DISABLED,
  GEN_ICON_MIN,
  REPLY_ICON,
  REPLY_ICON_DISABLED,
  UP_ARROW_ICON,
  DOWN_ARROW_ICON,
} from '@/icons';

// Helper to create and append child elements
function createElement(
  tag: keyof HTMLElementTagNameMap,
  className: string,
  innerHTML = '',
  title?: string
): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  if (innerHTML) element.innerHTML = innerHTML;
  if (title) element.title = title;
  return element;
}

// Helper to toggle visibility of banner content
function toggleBannerContent(
  titleContainer: HTMLElement,
  bannerContent: HTMLElement,
  collapseIcon: HTMLElement,
  isCollapsed: boolean
) {
  bannerContent.style.display = isCollapsed ? 'block' : 'none';
  titleContainer.style.marginBottom = isCollapsed ? '16px' : '0px';
  collapseIcon.innerHTML = isCollapsed ? UP_ARROW_ICON : DOWN_ARROW_ICON;
}

const TITLE = 'Thunderbird Assist (Alpha)';
const NOT_AVAILABLE = `No summary available, press ${GEN_ICON_MIN} to generate one.`;

const COLLAPSE_TOOLTIP = 'Hide AI summary';
const SUMMARY_TOOLTIP = 'Generate a quick summary of this email using AI';
const REPLY_TOOLTIP = 'Generate a reply to this email using AI';

// const SPIN_CLASS = 'reply-icon-spinning';
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIntervalId: number | null = null;

let currentMessageId: string | null = null;
let isGenerating = false; // Track if summary generation is ongoing
let isReplying = false; // Track if reply is ongoing

interface GetBannerResponse {
  text: string;
  noSummary: boolean;
  encrypted?: boolean;
}

async function handleGenerateClick(
  generateItem: HTMLElement,
  messageId: string,
  noSummary: boolean,
  bannerContent: HTMLElement
) {
  if (isGenerating) return; // Exit if a process is already running
  isGenerating = true; // Set flag to prevent further clicks

  let frameIndex = 0;
  generateItem.textContent = spinnerFrames[frameIndex];
  generateItem.style.cursor = 'default';

  // Kick off the interval
  spinnerIntervalId = window.setInterval(() => {
    frameIndex = (frameIndex + 1) % spinnerFrames.length;
    generateItem.textContent = spinnerFrames[frameIndex];
  }, 80);

  bannerContent.innerHTML = `
  <div style="
    color: gray;
    font-style: italic;
    font-size: 0.9em;
    font-weight: lighter;
  ">
    Generating summary…
  </div>`;

  let firstChunk = true;
  const onChunkReceived = (message: { chunk?: string }) => {
    if (firstChunk) {
      bannerContent.innerText = '';
      firstChunk = false;
    }
    if (message.chunk && currentMessageId === messageId) {
      bannerContent.innerText += message.chunk;
    }
    return false;
  };
  messenger.runtime.onMessage.addListener(onChunkReceived);

  try {
    await messenger.runtime.sendMessage({
      action: noSummary ? GEN_SUMMARY_CMD : REGEN_SUMMARY_CMD,
    });
    await showBanner(messageId);
  } catch (e) {
    bannerContent.innerText = FAILED_SUMMARY;
    await messenger.runtime.sendMessage({
      action: LOG_ERROR_CMD,
      errorContent: e,
    });
  } finally {
    if (spinnerIntervalId !== null) {
      clearInterval(spinnerIntervalId);
      spinnerIntervalId = null;
    }
    generateItem.innerHTML = GEN_ICON;
    isGenerating = false; // Reset flag to allow future clicks
    messenger.runtime.onMessage.removeListener(onChunkReceived);
  }
}

async function handleReplyClick(replyItem: HTMLElement) {
  if (isReplying) return; // Exit if a process is already running
  isReplying = true; // Set flag to prevent further clicks

  let frameIndex = 0;
  replyItem.textContent = spinnerFrames[frameIndex];
  replyItem.style.cursor = 'default';

  // Kick off the interval
  spinnerIntervalId = window.setInterval(() => {
    frameIndex = (frameIndex + 1) % spinnerFrames.length;
    replyItem.textContent = spinnerFrames[frameIndex];
  }, 80);
  try {
    await browser.runtime.sendMessage({
      action: GEN_REPLY_CMD,
    });
  } catch (e) {
    await messenger.runtime.sendMessage({
      action: LOG_ERROR_CMD,
      errorContent: e,
    });
  } finally {
    if (spinnerIntervalId !== null) {
      clearInterval(spinnerIntervalId);
      spinnerIntervalId = null;
    }
    replyItem.innerHTML = REPLY_ICON;
    isReplying = false; // Reset flag to allow future clicks
  }
}

async function showBanner(messageId: string) {
  currentMessageId = messageId;

  const { text, noSummary, encrypted } = (await browser.runtime.sendMessage({
    action: GET_BANNER_CMD,
  })) as GetBannerResponse;

  // Remove existing banner if present
  const existingBanner = document.querySelector('.bannerContainer');
  if (existingBanner) {
    existingBanner.remove();
  }

  // Create new banner elements
  const bannerContainer = createElement('div', 'bannerContainer');
  const banner = createElement('div', 'banner');
  const titleContainer = createElement('div', 'titleContainer');
  const titleText = createElement('span', 'titleText', TITLE);
  const titleLogo = createElement('div', 'titleLogo', FLWR_ICON);

  let content = text;
  if (noSummary) {
    if (encrypted) {
      content = FAILED_SUMMARY_ENCRYPTED;
    } else {
      content = NOT_AVAILABLE;
    }
  }
  const bannerContent = createElement('div', 'bannerText', content);
  const settingsLink = bannerContent.querySelector('#settingsLink');
  if (settingsLink) {
    settingsLink.addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        action: OPEN_OPTIONS_CMD,
      });
    });
  }

  const collapseIcon = createElement('div', 'collapseIcon', UP_ARROW_ICON, COLLAPSE_TOOLTIP);

  const generateItem = createElement('div', 'genIcon', GEN_ICON, SUMMARY_TOOLTIP);
  const replyItem = createElement('div', 'replyIcon', REPLY_ICON, REPLY_TOOLTIP);

  generateItem.addEventListener(
    'click',
    (event) =>
      void (async () => {
        event.stopPropagation();
        if (!isGenerating && generateItem.innerHTML !== GEN_ICON_DISABLED) {
          await handleGenerateClick(generateItem, messageId, noSummary, bannerContent);
        }
      })()
  );

  replyItem.addEventListener(
    'click',
    (event) =>
      void (async () => {
        event.stopPropagation();
        if (!isReplying && replyItem.innerHTML !== REPLY_ICON_DISABLED) {
          await handleReplyClick(replyItem);
        }
      })()
  );

  let isCollapsed = false;
  titleContainer.addEventListener('click', () => {
    toggleBannerContent(titleContainer, bannerContent, collapseIcon, isCollapsed);
    isCollapsed = !isCollapsed;
  });

  titleContainer.append(titleLogo, titleText, generateItem, replyItem, collapseIcon);
  banner.append(titleContainer, bannerContent);
  bannerContainer.append(banner);

  if (text && text !== NO_SUMMARY_AVAILABLE) {
    const feedbackContainer = createElement('div', 'feedbackContainer');
    const feedbackBlock = createElement('div', 'feedbackBlock');
    const feedbackNote = createElement(
      'div',
      'feedbackNote',
      '💬 Provide feedback on this summary'
    );
    const infoBox = createElement(
      'div',
      'infoBox',
      'This summary was generated automatically by the `Assist` add-on.' +
        "\n\nFeel free to send your feedback using <a id='goodFeedbackLink' href='#'>👍</a> or <a id='badFeedbackLink' href='#'>👎</a>." +
        `\n\n${FEEDBACK_DISCLAIMER}` +
        '\n\nNote that you can modify the prompt used to generate this summary in the <a id="settingsLink" href="#">settings page</a> of the add-on.'
    );

    feedbackBlock.appendChild(feedbackNote);
    feedbackBlock.appendChild(infoBox);
    feedbackContainer.appendChild(feedbackBlock);
    banner.appendChild(feedbackContainer);

    const settingsLink = infoBox.querySelector('#settingsLink');
    if (settingsLink) {
      settingsLink.addEventListener('click', async () => {
        await browser.runtime.sendMessage({
          action: OPEN_OPTIONS_CMD,
        });
      });
    }

    const badFeedbackLink = infoBox.querySelector('#badFeedbackLink');
    const goodFeedbackLink = infoBox.querySelector('#goodFeedbackLink');
    if (badFeedbackLink) {
      badFeedbackLink.addEventListener('click', async () => {
        await browser.runtime.sendMessage({
          action: SEND_FEEDBACK,
          summary: text,
          rating: 'bad',
        });
      });
    }
    if (goodFeedbackLink) {
      goodFeedbackLink.addEventListener('click', async () => {
        await browser.runtime.sendMessage({
          action: SEND_FEEDBACK,
          summary: text,
          rating: 'good',
        });
      });
    }
  }
  document.body.insertBefore(bannerContainer, document.body.firstChild);
}

void (async () => {
  const enabledAccount = await browser.runtime.sendMessage({ action: GET_ENABLED_ACCOUNT_CMD });
  if (enabledAccount) {
    await browser.runtime
      .sendMessage({ action: GET_CURRENT_MSG_CMD })
      .then(async (messageId: string) => {
        if (messageId) await showBanner(messageId);
      })
      .then()
      .catch(async (err) => {
        await messenger.runtime.sendMessage({
          action: LOG_ERROR_CMD,
          errorContent: err,
        });
      });
  }
})();
