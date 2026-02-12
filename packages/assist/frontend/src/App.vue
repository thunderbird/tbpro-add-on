<script setup lang="ts">
import DailyBrief from '@/components/DailyBrief.vue';
import LoginPage from '@/components/LoginPage.vue';
import { logger } from '@thunderbirdops/services-utils';
import type { Ref } from 'vue';
import { onMounted, ref } from 'vue';
import { version as appVersion } from '../package.json';

import { RELOAD_CONTENT_SCRIPT, REMOVE_CONTENT_SCRIPT, SUMMARY_CHECK_INTERVAL } from '@/const';

const error = ref('');
const duration = ref(0);
const tokenCount = ref(0);
const summary = ref({});
const allInboxes: Ref<Record<string, any>> = ref([]);
const selectedAccountId = ref('');
const showDevPanel = ref(false);
const inProgress = ref(false);
const user = ref(null);
const showHelp = ref(false);

// Make sure we only show them the release notes for this version one time.
let hasShownNotification: boolean = false;
try {
  const storedVal = localStorage.getItem(`assist/release-${appVersion}/has-shown-notes`);
  if (storedVal) {
    console.log(`got a value for assist/release-${appVersion}/has-shown-notes`, storedVal);
    hasShownNotification = JSON.parse(storedVal);
  } else {
    console.log(`what? no stored value? boo`);
  }
} catch {
  console.log(`weird. couldn't convert I guess`);
  hasShownNotification = false;
}

const shouldShowNotification = ref(!hasShownNotification);

let summaryInterval: ReturnType<typeof setInterval>;

// Utility function for getting the tab info from TB.
async function getTab() {
  try {
    const thisTab = await messenger.tabs.getCurrent();
    return thisTab;
  } catch (e) {
    logger.error(e);
  }
}

// Wrapper function for sending a message to background.js
async function sendMessage(obj: Record<string, any>) {
  try {
    const resp = await browser.runtime.sendMessage(obj);
    return resp;
  } catch (e) {
    logger.error(e);
  }
}

async function openEmailMessage(headerMessageId: string) {
  await sendMessage({
    action: `captureMetrics`,
    payload: 'email_view',
  }); //
  await messenger.messageDisplay.open({
    headerMessageId,
    location: 'tab',
  });
}

// Make background.js aware of the tab running the Vue app.
async function registerTab() {
  const thisTab = await getTab();
  if (thisTab) {
    await sendMessage({
      action: `registerTab`,
      payload: thisTab.url,
    });
  }
}

async function getInboxes() {
  const resp = await sendMessage({
    action: `getInboxes`,
  });
  allInboxes.value = resp;
  selectedAccountId.value = allInboxes.value[0].id;
  // Use email address matches @thunderbird.net or @mozilla.com
  if (Array.isArray(allInboxes.value)) {
    for (const inbox of allInboxes.value) {
      if (/thunderbird/.test(inbox.email) || /mozilla/.test(inbox.email)) {
        selectedAccountId.value = inbox.id;
      }
    }
  }
}

async function getPreviousSummary() {
  const resp = await sendMessage({
    action: `getPreviousSummary`,
    accountId: selectedAccountId.value,
  });
  if (resp) {
    summary.value = resp.summary;
    duration.value = resp.duration;
    tokenCount.value = resp.tokenCount;
    error.value = '';
  } else {
    console.log(`There is no previous summary. Got this:`);
    console.log(resp);
  }
  inProgress.value = false;
}

async function getSummary() {
  inProgress.value = true;
  summary.value = {};
  error.value = '';
  duration.value = 0;
  tokenCount.value = 0;
  const resp = await sendMessage({
    action: `getSummary`,
    accountId: selectedAccountId.value,
  });

  if (resp) {
    if (resp.error) {
      summary.value = {};
      duration.value = 0;
      tokenCount.value = 0;
      error.value = resp.error;
    } else {
      summary.value = resp.summary;
      duration.value = resp.duration;
      tokenCount.value = resp.tokenCount;
      error.value = '';
      await sendMessage({
        action: 'setLastSummaryTime',
        payload: new Date(),
      });
    }
  }
  inProgress.value = false;
}

async function openLoginPopup(url: string) {
  const resp = await sendMessage({
    action: `openLoginPopup`,
    url,
  });

  if (resp.popup === 'closed') {
    await getUser();
    postLoginProcedure();
  }
}

async function logout() {
  const resp = await fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
    mode: 'cors',
    credentials: 'include', // include cookies
  });
  const data = await resp.json();
  if (data.status === 'ok') {
    user.value = null;
    sendMessage({
      action: REMOVE_CONTENT_SCRIPT,
    });
  }
}

async function getUser() {
  const resp = await fetch(`${import.meta.env.VITE_API_URL}/auth/stat`, {
    mode: 'cors',
    credentials: 'include', // include cookies
  });
  const data = await resp.json();
  if (data.uid && data.email) {
    user.value = data;
    return data;
  }

  return null;
}

// For debugging the scheduler
async function clearLastSummaryTime() {
  sendMessage({
    action: 'clearLastSummaryTime',
  });
}

async function runOnSchedule() {
  const isTimeToRun = await sendMessage({
    action: 'getIsTimeToRun',
  });

  if (isTimeToRun) {
    console.info(`App.vue - it's time to run!`);
    getSummary();
  } else {
    console.info(`App.vue: gotta wait before another run. Showing last summary`);
    getPreviousSummary();
  }
}

function regularlyCheckForSummary() {
  // Ensure that we only start a single interval.
  if (!summaryInterval) {
    summaryInterval = setInterval(() => {
      runOnSchedule();
    }, SUMMARY_CHECK_INTERVAL);
  }
}

function postLoginProcedure() {
  // Make initial attempt at getting summary.
  runOnSchedule();

  // Add summary banner once logged in
  sendMessage({
    action: RELOAD_CONTENT_SCRIPT,
  });

  // Start regular check to see if we can get another summary.
  regularlyCheckForSummary();
}

onMounted(async () => {
  try {
    await registerTab();
    await getInboxes();

    if (await getUser()) {
      postLoginProcedure();

      // Setting as string, instead of boolean, and then converting to string.
      localStorage.setItem(`assist/release-${appVersion}/has-shown-notes`, 'true');
    }
  } catch (e) {
    logger.error(`App.vue hit error onMounted`);
    logger.error(e);
  }
});
</script>

<template>
  <header>
    <h1>Daily Brief</h1>
    <div>
      <button class="plain-button" @click="showDevPanel = !showDevPanel">
        Toggle Developer Panel
      </button>
      <br />
      <a
        href="https://docs.google.com/forms/d/e/1FAIpQLSeLrXsrARXJ6ODh0vD6TF2-qjn23FiXoQNuT1jnuBYDQweSvg/viewform"
      >
        Give Feedback
      </a>
      <br />
      <a href="https://github.com/thunderbird/assist/issues/new"> Create a GitHub Issue </a>
    </div>
  </header>
  <main>
    <div class="login-panel" v-if="!user">
      <LoginPage @openLoginPopup="openLoginPopup" />
    </div>
    <div v-if="showDevPanel">
      <span> Selected mailbox id: {{ selectedAccountId }} </span>
      <br />
      <br />
      <br />
      <span v-if="user">
        User:
        <br />
        {{ user }}
        <br />
        <button @click="logout">Log out</button>
      </span>
      <br />
      <div v-if="!user">
        <button @click="getUser">Get user</button>
      </div>
      <br />
    </div>
    <div v-if="user">
      <br />
      <a class="plain-button" @click="shouldShowNotification = !shouldShowNotification">
        <span v-if="shouldShowNotification">Hide</span>
        <span v-if="!shouldShowNotification">Show</span>
        Release Notes
      </a>
      <div v-if="shouldShowNotification">
        <h2>v{{ appVersion }}</h2>
        <p><b>Improved default prompt</b></p>
        <ul>
          <li>Assist now uses an optimized prompt for summarizing emails.</li>
          <li>For now, we have removed the ability to customize summary and reply prompts</li>
        </ul>
        <p><b>Encrypted emails are excluded by default.</b></p>
        <ul>
          <li>They can be enabled in the Assist add-on preferences.</li>
        </ul>
      </div>
      <br />
      <a class="plain-button" @click="showHelp = !showHelp">Toggle Help Information</a>
      <div v-if="showHelp">
        <h2>How to use the Daily Brief</h2>
        <p>To get started, let Assist know what kind of emails are important to you.</p>
        <br />
        <p>
          Currently, we do this using two of the default tags: "Important" and "Later".
          <br />
          (If you have customized your tags, you'll need to add tags for "Important" and "Later".)
        </p>
        <br />
        <p>In your message list, you can right-click messages and choose a Tag from the menu.</p>
        <br />
        <p>
          Alternatively, you can use the following keyboard shortcuts if you are using the built-in
          Tags:
        </p>
        <ol>
          <li>
            To tag an email as "Important", select it and press the
            <code>1</code>
            key on your keyboard.
          </li>
          <li>
            To tag an email as "Later", press the
            <code>5</code>
            key.
          </li>
        </ol>
        <br />
        <p>This will provide Assist with enough data so that it can generate a daily brief.</p>
        <br />
        <p>
          It will automatically generate a new brief each morning at 7am, or whenever you click the
          "Get Daily Brief" button.
        </p>
        <br />
        <br />
        <h2>How to use the Message Summary and Reply features</h2>
        <br />
        <p>At the top of each message, a banner will show:</p>
        <ol>
          <li>A summary of the email</li>
          <li>A button to generate a summary</li>
          <li>A button to generate a reply</li>
        </ol>
        <br />
        <p>
          New messages will automatically be summarized.
          <br />
          For older messages, press the button to generate one.
        </p>
        <br />
      </div>

      <br />
      <br />
      <div>
        <label>Mailbox: </label>
        <select v-model="selectedAccountId">
          <option v-for="inbox in allInboxes" :key="inbox.id" :value="inbox.id">
            {{ inbox.email }}
          </option>
        </select>
      </div>
      <br />

      <button @click="getSummary">Get Email Summary</button>
      <div v-if="inProgress">
        <br />
        <br />
        <p>Generating...</p>
      </div>
      <div v-if="typeof summary === 'string'">
        <p>{{ summary }}</p>
      </div>
      <div v-else-if="summary">
        <DailyBrief :summary="summary" @openEmailMessage="openEmailMessage" />
        <br />
        <br />
        <div v-if="duration">Classification + summary took {{ duration }} seconds.</div>
        <div v-if="tokenCount">Used {{ tokenCount }} tokens.</div>
      </div>
      <div v-if="error">
        {{ error }}
      </div>
    </div>
  </main>
</template>

<style scoped>
header,
main {
  display: block;
}

header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2rem;

  div {
    text-align: right;
  }

  .login-panel {
    outline: 1px solid red;
    text-align: left;
  }
}

textarea {
  width: 100%;
  height: 10rem;
}

textarea.api-key {
  height: 3rem;
}

.plain-button {
  border: 0;
  background: none;
  padding-left: 0;
  margin-left: 0;
  color: var(--color-text);

  &:hover {
    cursor: pointer;
  }
}

b {
  font-weight: 700;
}
</style>
