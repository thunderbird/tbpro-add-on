<script lang="ts" setup>
/**
 * Boot-time checklist shown before the Send app loads (Bugzilla 2064458).
 *
 * Mounted by send.js as its own tiny Vue app, on its own element, before the
 * real one. It must stay free of stores, the router and anything that touches
 * browser storage while loading: the whole point is to still render when
 * Thunderbird's "block all cookies" makes storage access throw and the main
 * bundle cannot be evaluated (see lib/bootDiagnostics.ts).
 *
 * While the checks run — and while the app bundle loads — only a spinner is
 * shown. When nothing blocks, `start` is awaited: it imports and mounts the
 * real app, then removes this one, so a healthy boot shows no checklist at all.
 * Only when a step blocks does the checklist appear, with the failing step's
 * detail, so a user, or a screenshot in a bug report, can say exactly where
 * boot stopped.
 */
import config from '@send-frontend/config';
import {
  BOOT_STEPS,
  describeError,
  runBootChecks,
  type BootBlocker,
  type BootStepId,
  type BootStepOutcome,
} from '@send-frontend/lib/bootDiagnostics';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import { computed, onMounted, reactive, ref } from 'vue';

const props = defineProps<{
  /**
   * Loads and mounts the real app. A rejection is shown as the final step
   * failing, with the error text, instead of a blank page.
   */
  start: () => Promise<void>;
  /**
   * Optional: begin downloading the app bundle. Called the moment browser
   * storage passes — the one check that must precede evaluating that bundle —
   * so the download overlaps the network checks instead of following them.
   */
  preload?: () => void;
}>();

type StepId = BootStepId | 'app';
type StepStatus = 'pending' | 'running' | BootStepOutcome;
type Step = { id: StepId; label: string; status: StepStatus; detail: string };

const STATUS_MARKS: Record<StepStatus, string> = {
  pending: '○',
  running: '…',
  passed: '✓',
  warning: '!',
  failed: '✕',
};

const steps = reactive<Step[]>(
  BOOT_STEPS.map(({ id, label }) => ({
    id,
    label,
    status: 'pending',
    detail: '',
  }))
);
const blockedBy = ref<BootBlocker | 'app' | null>(null);
const starting = ref(false);

function setStep(id: StepId, status: StepStatus, detail = '') {
  const step = steps.find((candidate) => candidate.id === id);
  if (step) {
    step.status = status;
    step.detail = detail;
  }
}

const failure = computed(() => {
  switch (blockedBy.value) {
    case 'storage':
      return {
        title: CLIENT_MESSAGES.STORAGE_BLOCKED_TITLE,
        body: CLIENT_MESSAGES.STORAGE_BLOCKED_BODY,
      };
    case 'crossSiteCookie':
      return {
        title: CLIENT_MESSAGES.COOKIES_BLOCKED_TITLE,
        body: CLIENT_MESSAGES.COOKIES_BLOCKED_BANNER_BODY,
      };
    case 'app':
      return {
        title: CLIENT_MESSAGES.APP_LOAD_FAILED_TITLE,
        body: CLIENT_MESSAGES.APP_LOAD_FAILED_BODY,
      };
    default:
      return null;
  }
});

// Only a cross-site cookie block is safe to override (share links, for one,
// work without a session). Denied storage breaks the bundle itself, and a
// failed import cannot be retried in place.
const canContinue = computed(() => blockedBy.value === 'crossSiteCookie');

async function handOffToApp() {
  if (starting.value) {
    return;
  }
  starting.value = true;
  blockedBy.value = null;
  setStep('app', 'running');
  try {
    await props.start();
    setStep('app', 'passed');
  } catch (error) {
    console.error('[boot] the application failed to load:', error);
    setStep('app', 'failed', describeError(error));
    blockedBy.value = 'app';
    starting.value = false;
  }
}

async function runDiagnostics() {
  let blocker: BootBlocker | null = null;
  try {
    blocker = await runBootChecks(config.sendServerUrl ?? '', (progress) => {
      if (progress.status === 'running') {
        setStep(progress.id, 'running');
        return;
      }
      const { outcome, detail } = progress.result;
      setStep(progress.id, outcome, detail);
      if (progress.id === 'storage' && outcome === 'passed') {
        props.preload?.();
      }
    });
  } catch (error) {
    // The diagnostics are advisory: they must never be the reason the app
    // does not start.
    console.error('[boot] diagnostics failed:', error);
  }
  if (blocker) {
    blockedBy.value = blocker;
    return;
  }
  await handOffToApp();
}

// A reload rather than an in-page rerun: a module whose evaluation threw cannot
// be imported again, and a changed Thunderbird setting is picked up cleanly on
// a fresh load.
function retry() {
  window.location.reload();
}

onMounted(runDiagnostics);
</script>

<template>
  <section class="boot" data-testid="boot-diagnostics">
    <div
      v-if="!failure"
      class="spinner"
      role="status"
      aria-label="Starting Thunderbird Send"
      data-testid="boot-spinner"
    ></div>

    <template v-else>
      <p class="heading">Startup check failed</p>
      <ol class="steps" data-testid="boot-steps">
        <li
          v-for="step in steps"
          :key="step.id"
          :class="step.status"
          :data-testid="`boot-step-${step.id}`"
          :data-status="step.status"
        >
          <span class="mark" aria-hidden="true">
            {{ STATUS_MARKS[step.status] }}
          </span>
          <span>{{ step.label }}</span>
          <span
            v-if="step.detail"
            class="detail"
            :data-testid="`boot-step-${step.id}-detail`"
          >
            {{ step.detail }}
          </span>
        </li>
      </ol>

      <div class="failure" role="alert" data-testid="boot-failure">
        <p class="title">{{ failure.title }}</p>
        <p>{{ failure.body }}</p>
        <div class="actions">
          <button type="button" data-testid="boot-retry" @click="retry">
            Retry
          </button>
          <button
            v-if="canContinue"
            type="button"
            class="secondary"
            data-testid="boot-continue"
            :disabled="starting"
            @click="handOffToApp"
          >
            Continue anyway
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* Self-contained on purpose: the app stylesheet ships with the app bundle,
   which this panel exists to render without. */
.boot {
  max-width: 40rem;
  margin: 2rem auto;
  padding: 1rem 1.5rem;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  color: #1a1a1a;
}
.spinner {
  width: 2rem;
  height: 2rem;
  margin: 4rem auto;
  border: 3px solid #d4d4d8;
  border-top-color: #1a1a1a;
  border-radius: 50%;
  animation: boot-spin 0.8s linear infinite;
}
@keyframes boot-spin {
  to {
    transform: rotate(360deg);
  }
}
.heading {
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.steps li {
  display: grid;
  grid-template-columns: 1.25rem 1fr;
  column-gap: 0.5rem;
  align-items: baseline;
}
.mark {
  font-weight: 700;
  text-align: center;
}
.pending {
  opacity: 0.55;
}
.passed .mark {
  color: #15803d;
}
.warning .mark {
  color: #a16207;
}
.failed .mark {
  color: #b91c1c;
}
.detail {
  grid-column: 2;
  font-size: 12px;
  opacity: 0.75;
}
.failure {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 0.375rem;
  background: #facc15;
}
.title {
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
button {
  padding: 0.35rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #1a1a1a;
  border-radius: 0.25rem;
  background: #fff;
}
button.secondary {
  background: transparent;
}
button:disabled {
  cursor: progress;
  opacity: 0.6;
}
</style>
