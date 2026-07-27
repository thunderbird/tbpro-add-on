/**
 * HAPPY PATH — the full attach → popup → upload → complete round trip, with
 * nothing going wrong. This is the correct-behavior counterpart to the B1-B5
 * bug specs in this directory: it proves the harness (and background.ts's
 * real message protocol) correctly models the ordinary case those bug specs
 * are exceptions to, not just the failure modes.
 *
 * Flow under test (background.ts):
 *   onFileUpload -> uploadInfoQueue + uploadPromiseMap + popupTimer(250ms)
 *   -> openUnifiedPopup() -> windows.create() -> popupWindowId set
 *   -> popup sends POPUP_READY -> background replies FILE_LIST, clears queue
 *   -> popup sends ALL_UPLOADS_COMPLETE -> background resolves the matching
 *      uploadPromiseMap entry and, for a passphrase-bearing (`#`-hash) URL,
 *      calls the add-password API.
 *
 * See README.md for what this harness does/doesn't simulate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import {
  attachAndOpenPopup,
  setupHost,
  stubContext,
  teardownHost,
} from './testHelpers';
import { useApiStore } from 'send-frontend/src/stores';

describe('Happy path: full upload golden path', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('attach -> popup opens -> FILE_LIST delivered -> upload completes -> promise resolves with the share URL', async () => {
    const bg = stubContext(host);
    await import('../../background');

    const { upload, popupWindow } = await attachAndOpenPopup(host, bg, {
      id: 1,
      name: 'report.pdf',
      data: new Blob(['contents']),
    });
    expect(popupWindow).not.toBeNull();

    await bg.deliverMessage({ type: 'POPUP_READY' });

    // The popup gets exactly the queued file, and only once.
    const fileListCalls = (
      bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([msg]) => msg?.type === 'FILE_LIST');
    expect(fileListCalls).toHaveLength(1);
    expect(fileListCalls[0][0].files).toEqual([
      { id: 1, name: 'report.pdf', data: expect.any(Blob) },
    ]);

    // Popup finishes uploading and reports success, matching
    // useUploadAndShare.ts's shareComplete() message shape.
    await bg.deliverMessage({
      type: 'ALL_UPLOADS_COMPLETE',
      url: 'https://send.tb.pro/share/abc123',
      results: [{ originalId: 1 }],
    });

    // The onFileUpload promise Thunderbird is holding resolves with the URL
    // — this is the actual signal Thunderbird uses to know the upload
    // succeeded and attach the link to the outgoing message.
    await expect(upload).resolves.toEqual({
      aborted: false,
      url: 'https://send.tb.pro/share/abc123',
    });
  });

  it('a passphrase-bearing (hash) URL triggers the add-password API call with the right link id and hash', async () => {
    const bg = stubContext(host);
    await import('../../background');
    const { api } = useApiStore();
    const apiCallSpy = vi.spyOn(api, 'call').mockResolvedValue({ success: true });

    const { upload } = await attachAndOpenPopup(host, bg, {
      id: 2,
      name: 'secret.txt',
      data: new Blob(['s']),
    });
    await bg.deliverMessage({ type: 'POPUP_READY' });

    await bg.deliverMessage({
      type: 'ALL_UPLOADS_COMPLETE',
      url: 'https://send.tb.pro/share/link-xyz#thepassphrasehash',
      results: [{ originalId: 2 }],
    });
    await expect(upload).resolves.toMatchObject({ aborted: false });

    expect(apiCallSpy).toHaveBeenCalledWith(
      'sharing/link-xyz/add-password',
      { linkId: 'link-xyz', password: 'thepassphrasehash' },
      'POST'
    );
    apiCallSpy.mockRestore();
  });

  it('a plain (non-passphrase) URL does NOT trigger the add-password API call', async () => {
    const bg = stubContext(host);
    await import('../../background');
    const { api } = useApiStore();
    const apiCallSpy = vi.spyOn(api, 'call').mockResolvedValue({ success: true });

    const { upload } = await attachAndOpenPopup(host, bg, {
      id: 3,
      name: 'public.txt',
      data: new Blob(['p']),
    });
    await bg.deliverMessage({ type: 'POPUP_READY' });

    await bg.deliverMessage({
      type: 'ALL_UPLOADS_COMPLETE',
      url: 'https://send.tb.pro/share/no-password-link',
      results: [{ originalId: 3 }],
    });
    await expect(upload).resolves.toMatchObject({ aborted: false });

    // No '#' in the URL -> isPasswordProtected is false -> the add-password
    // branch (`if (!isPasswordProtected)`) does not run.
    expect(apiCallSpy).not.toHaveBeenCalled();
    apiCallSpy.mockRestore();
  });
});
