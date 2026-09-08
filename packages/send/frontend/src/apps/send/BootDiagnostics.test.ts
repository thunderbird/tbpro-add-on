import {
  runBootChecks,
  type BootBlocker,
  type BootStepId,
  type BootStepResult,
} from '@send-frontend/lib/bootDiagnostics';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import { getByTestId } from '@send-frontend/lib/testUtils';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BootDiagnostics from './BootDiagnostics.vue';

vi.mock('@send-frontend/lib/bootDiagnostics', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@send-frontend/lib/bootDiagnostics')>();
  return { ...actual, runBootChecks: vi.fn() };
});

const passed = (id: BootStepId, detail = 'ok'): BootStepResult => ({
  id,
  outcome: 'passed',
  detail,
});

/** Scripts runBootChecks: reports each result in order, then returns the blocker. */
function scriptChecks(results: BootStepResult[], blocker: BootBlocker | null) {
  vi.mocked(runBootChecks).mockImplementation(async (_url, onProgress) => {
    for (const result of results) {
      onProgress({ id: result.id, status: 'running' });
      onProgress({ id: result.id, status: 'done', result });
    }
    return blocker;
  });
}

const ALL_PASSED: BootStepResult[] = [
  passed('storage'),
  passed('firstPartyCookie'),
  passed('backend'),
  passed('crossSiteCookie'),
];

async function mountPanel({
  start = vi.fn().mockResolvedValue(undefined),
  preload = vi.fn(),
} = {}) {
  const wrapper = mount(BootDiagnostics, { props: { start, preload } });
  await flushPromises();
  return { wrapper, start, preload };
}

const status = (wrapper: ReturnType<typeof mount>, id: string) =>
  wrapper.find(getByTestId(`boot-step-${id}`)).attributes('data-status');

describe('BootDiagnostics.vue', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows only a spinner while the checks run and the app loads', async () => {
    scriptChecks(ALL_PASSED, null);
    // Never resolves: keeps the panel in its "loading the app" state.
    const { wrapper } = await mountPanel({
      start: vi.fn(() => new Promise<void>(() => {})),
    });

    expect(wrapper.find(getByTestId('boot-spinner')).exists()).toBe(true);
    expect(wrapper.find(getByTestId('boot-steps')).exists()).toBe(false);
    expect(wrapper.find(getByTestId('boot-failure')).exists()).toBe(false);
  });

  it('hands off to the app when nothing blocks, without ever showing the checklist', async () => {
    scriptChecks(ALL_PASSED, null);
    const { wrapper, start } = await mountPanel();

    expect(start).toHaveBeenCalledTimes(1);
    expect(wrapper.find(getByTestId('boot-steps')).exists()).toBe(false);
    expect(wrapper.find(getByTestId('boot-failure')).exists()).toBe(false);
  });

  it('preloads the app bundle right after storage passes, and not before', async () => {
    const order: string[] = [];
    vi.mocked(runBootChecks).mockImplementation(async (_url, onProgress) => {
      for (const result of ALL_PASSED) {
        onProgress({ id: result.id, status: 'running' });
        order.push(result.id);
        onProgress({ id: result.id, status: 'done', result });
      }
      return null;
    });
    const { preload } = await mountPanel({
      preload: vi.fn(() => {
        order.push('preload');
      }),
    });
    expect(preload).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      'storage',
      'preload',
      'firstPartyCookie',
      'backend',
      'crossSiteCookie',
    ]);

    scriptChecks(
      [{ id: 'storage', outcome: 'failed', detail: 'denied' }],
      'storage'
    );
    const denied = await mountPanel();
    expect(denied.preload).not.toHaveBeenCalled();
  });

  it('stops on denied storage with the storage message and no way to continue', async () => {
    scriptChecks(
      [
        {
          id: 'storage',
          outcome: 'failed',
          detail: 'SecurityError: The operation is insecure.',
        },
      ],
      'storage'
    );
    const { wrapper, start } = await mountPanel();

    expect(start).not.toHaveBeenCalled();
    expect(wrapper.find(getByTestId('boot-spinner')).exists()).toBe(false);
    expect(status(wrapper, 'storage')).toBe('failed');
    expect(wrapper.find(getByTestId('boot-step-storage-detail')).text()).toBe(
      'SecurityError: The operation is insecure.'
    );
    // Later steps never ran: the panel must say so rather than show them green.
    expect(status(wrapper, 'crossSiteCookie')).toBe('pending');
    expect(status(wrapper, 'app')).toBe('pending');

    const failure = wrapper.find(getByTestId('boot-failure'));
    expect(failure.text()).toContain(CLIENT_MESSAGES.STORAGE_BLOCKED_TITLE);
    expect(wrapper.find(getByTestId('boot-retry')).exists()).toBe(true);
    expect(wrapper.find(getByTestId('boot-continue')).exists()).toBe(false);
  });

  it('stops on blocked cross-site cookies but lets the user continue anyway, once', async () => {
    scriptChecks(
      [
        passed('storage'),
        passed('firstPartyCookie'),
        passed('backend'),
        { id: 'crossSiteCookie', outcome: 'failed', detail: 'not sent back' },
      ],
      'crossSiteCookie'
    );
    let finishStart: () => void;
    const start = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve;
        })
    );
    const { wrapper } = await mountPanel({ start });

    expect(start).not.toHaveBeenCalled();
    expect(wrapper.find(getByTestId('boot-failure')).text()).toContain(
      CLIENT_MESSAGES.COOKIES_BLOCKED_TITLE
    );

    const continueButton = wrapper.find(getByTestId('boot-continue'));
    await continueButton.trigger('click');
    // A second click while the bundle is still loading must not start a
    // second app.
    await continueButton.trigger('click');
    expect(start).toHaveBeenCalledTimes(1);
    // Back to the spinner while the bundle loads.
    expect(wrapper.find(getByTestId('boot-spinner')).exists()).toBe(true);
    expect(wrapper.find(getByTestId('boot-failure')).exists()).toBe(false);

    finishStart();
    await flushPromises();
    expect(wrapper.find(getByTestId('boot-failure')).exists()).toBe(false);
  });

  it('does not surface warnings: the app starts as if all had passed', async () => {
    scriptChecks(
      [
        passed('storage'),
        { id: 'firstPartyCookie', outcome: 'warning', detail: 'dropped' },
        { id: 'backend', outcome: 'warning', detail: 'HTTP 503' },
        { id: 'crossSiteCookie', outcome: 'warning', detail: 'no answer' },
      ],
      null
    );
    const { wrapper, start } = await mountPanel();

    expect(start).toHaveBeenCalledTimes(1);
    expect(wrapper.find(getByTestId('boot-steps')).exists()).toBe(false);
  });

  it('reports a failed app load as the last step, with the error text', async () => {
    scriptChecks(ALL_PASSED, null);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { wrapper } = await mountPanel({
      start: vi
        .fn()
        .mockRejectedValue(new Error('Importing a module script failed.')),
    });

    expect(status(wrapper, 'app')).toBe('failed');
    // The earlier steps are shown too, so the report says how far boot got.
    expect(status(wrapper, 'storage')).toBe('passed');
    expect(wrapper.find(getByTestId('boot-step-app-detail')).text()).toBe(
      'Importing a module script failed.'
    );
    expect(wrapper.find(getByTestId('boot-failure')).text()).toContain(
      CLIENT_MESSAGES.APP_LOAD_FAILED_TITLE
    );
    expect(wrapper.find(getByTestId('boot-continue')).exists()).toBe(false);
    consoleError.mockRestore();
  });

  it('still starts the app when the diagnostics themselves throw', async () => {
    vi.mocked(runBootChecks).mockRejectedValue(new Error('unexpected'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { start } = await mountPanel();

    expect(start).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('retry reloads the page', async () => {
    scriptChecks(
      [{ id: 'storage', outcome: 'failed', detail: 'denied' }],
      'storage'
    );
    const reload = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {});
    const { wrapper } = await mountPanel();

    await wrapper.find(getByTestId('boot-retry')).trigger('click');

    expect(reload).toHaveBeenCalledTimes(1);
    reload.mockRestore();
  });
});
