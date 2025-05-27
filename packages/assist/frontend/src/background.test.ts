/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Mock flwrUtils to prevent dynamic import of FI module
vi.mock('@/lib/flowerUtils', () => ({
  getReplyById: vi.fn().mockResolvedValue({ reply: 'reply-content' }),
  getSummaryById: vi.fn().mockResolvedValue({ summary: 'summary-content' }),
  getBanner: vi.fn().mockReturnValue({ text: 'banner-text', noSummary: false }),
  getRemoteHandoff: vi.fn(),
  getDailyBrief: vi.fn(),
  fetchEmailBodyAndHash: vi.fn().mockReturnValue({ emailBody: 'email-content', emailHash: '' }),
  summarizeOnReceive: vi.fn(),
  getFlowerIntelligenceModule: vi.fn(),
}));

import * as utils from '@/lib/flowerUtils';
import metrics from '@/lib/metrics';
import {
  GEN_REPLY_CMD,
  GEN_SUMMARY_CMD,
  GET_BANNER_CMD,
  GET_CURRENT_MSG_CMD,
  LOG_ERROR_CMD,
  OPEN_OPTIONS_CMD,
  REGEN_SUMMARY_CMD,
} from './const';

declare let messenger: any;

let background: typeof import('./background');

beforeAll(async () => {
  // 1) Stub out messenger *before* loading the module
  globalThis.messenger = {
    // @ts-ignore
    runtime: { openOptionsPage: vi.fn().mockResolvedValue(undefined) },
    // @ts-ignore
    messageDisplay: { getDisplayedMessage: vi.fn() },
    // @ts-ignore
    tabs: { query: vi.fn().mockResolvedValue([]), sendMessage: vi.fn() },
    // @ts-ignore
    messages: { onNewMailReceived: { addListener: vi.fn() }, getFull: vi.fn() },
  };

  globalThis.browser = {
    storage: {
      // @ts-ignore
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  };

  // 2) Now dynamically import so that the module's top‐level
  //    registration against messenger.messages.onNewMailReceived
  //    happens against our stub.
  background = await import('./background');
});

describe('handleRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // flwrUtils
    vi.spyOn(utils, 'getReplyById').mockResolvedValue({ reply: 'reply-content' });
    vi.spyOn(utils, 'getSummaryById').mockResolvedValue({ summary: 'summary-content' });
    // @ts-ignore
    vi.spyOn(utils, 'getBanner').mockReturnValue({ text: 'banner-text', noSummary: false });

    // metrics
    vi.spyOn(metrics, 'capture');
  });

  it('handles OPEN_OPTIONS_CMD', async () => {
    const result = await background.handleRequest({ action: OPEN_OPTIONS_CMD });
    expect(messenger.runtime.openOptionsPage).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('handles LOG_ERROR_CMD', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const payload = { action: LOG_ERROR_CMD, errorContent: 'err' };
    const result = await background.handleRequest(payload);
    expect(spy).toHaveBeenCalledWith('err');
    expect(result).toBeNull();
  });

  it('returns null if no sender.tab.id', async () => {
    const result = await background.handleRequest({ action: GEN_REPLY_CMD }, {} as any);
    expect(result).toBeNull();
  });

  it('returns null if messageDisplay returns null', async () => {
    messenger.messageDisplay.getDisplayedMessage.mockResolvedValue(null);
    const sender = { tab: { id: 1 } } as any;
    const result = await background.handleRequest({ action: GEN_REPLY_CMD }, sender);
    expect(result).toBeNull();
  });

  it('handles GEN_REPLY_CMD', async () => {
    messenger.messageDisplay.getDisplayedMessage.mockResolvedValue({ id: 42 });
    const sender = { tab: { id: 99 } } as any;
    const result = await background.handleRequest({ action: GEN_REPLY_CMD }, sender);
    expect(metrics.capture).toHaveBeenCalledWith('reply_generate');
    expect(utils.getReplyById).toHaveBeenCalledWith(42);
    expect(result).toEqual({ reply: 'reply-content' });
  });

  it('handles GEN_SUMMARY_CMD', async () => {
    messenger.messageDisplay.getDisplayedMessage.mockResolvedValue({ id: 7 });
    const sender = { tab: { id: 5 } } as any;
    const result = await background.handleRequest({ action: GEN_SUMMARY_CMD }, sender);
    expect(metrics.capture).toHaveBeenCalledWith('summary_generate');
    expect(utils.getSummaryById).toHaveBeenCalledWith(7, false, 5);
    expect(result).toEqual({ summary: 'summary-content' });
  });

  it('handles REGEN_SUMMARY_CMD', async () => {
    messenger.messageDisplay.getDisplayedMessage.mockResolvedValue({ id: 8 });
    const sender = { tab: { id: 3 } } as any;
    const result = await background.handleRequest({ action: REGEN_SUMMARY_CMD }, sender);
    expect(metrics.capture).toHaveBeenCalledWith('summary_regenerate');
    expect(utils.getSummaryById).toHaveBeenCalledWith(8, true, 3);
    expect(result).toEqual({ summary: 'summary-content' });
  });

  it('handles GET_BANNER_CMD', async () => {
    messenger.messageDisplay.getDisplayedMessage.mockResolvedValue({ id: 10 });
    const sender = { tab: { id: 2 } } as any;
    const result = await background.handleRequest({ action: GET_BANNER_CMD }, sender);
    expect(utils.getBanner).toHaveBeenCalledWith(10);
    expect(result).toEqual({ text: 'banner-text', noSummary: false });
  });

  it('handles GET_CURRENT_MSG_CMD', async () => {
    messenger.messageDisplay.getDisplayedMessage.mockResolvedValue({ id: 15 });
    const sender = { tab: { id: 4 } } as any;
    const result = await background.handleRequest({ action: GET_CURRENT_MSG_CMD }, sender);
    expect(result).toBe(15);
  });

  it('returns null for unknown action', async () => {
    messenger.messageDisplay.getDisplayedMessage.mockResolvedValue({ id: 20 });
    const sender = { tab: { id: 6 } } as any;
    const result = await background.handleRequest({ action: 'UNKNOWN_CMD' }, sender);
    expect(result).toBeNull();
  });
});
