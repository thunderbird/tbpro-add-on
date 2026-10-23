/**
 * A popup showing the client update screen can't upload. Once it reports the
 * block, files attached while it stays open are rejected at once instead of
 * waiting for that popup to close; closing it restores normal uploads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeWindow, type FakeHost } from './fakeThunderbirdHost';
import {
  attachAndOpenPopup,
  setupHost,
  stubContext,
  teardownHost,
} from './testHelpers';

const BLOCKED = { type: 'ALL_UPLOADS_ABORTED', aborted: true, blocked: true };

describe('B6: a blocked popup rejects new attachments', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('rejects files attached while the update screen is open', async () => {
    const bg = stubContext(host);
    await import('../../background');

    const { upload, popupWindow } = await attachAndOpenPopup(host, bg, {
      id: 1,
      name: 'first.txt',
      data: new Blob(['a']),
    });
    await bg.deliverMessage(BLOCKED);
    await expect(upload).rejects.toThrow('User aborted the operation.');

    const later = bg.triggerFileUpload({
      id: 2,
      name: 'second.txt',
      data: new Blob(['b']),
    });
    await expect(later).rejects.toThrow(
      'Send must be updated before uploading.'
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(bg.browser.windows.create).toHaveBeenCalledTimes(1);

    closeWindow(host, popupWindow.id);
    const afterClose = bg.triggerFileUpload({
      id: 3,
      name: 'third.txt',
      data: new Blob(['c']),
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(bg.browser.windows.create).toHaveBeenCalledTimes(2);
    afterClose.catch(() => {});
  });

  it('keeps queueing files after a plain user abort', async () => {
    const bg = stubContext(host);
    await import('../../background');

    const { upload, popupWindow } = await attachAndOpenPopup(host, bg, {
      id: 1,
      name: 'first.txt',
      data: new Blob(['a']),
    });
    await bg.deliverMessage({ type: 'ALL_UPLOADS_ABORTED', aborted: true });
    await expect(upload).rejects.toThrow('User aborted the operation.');

    const later = bg.triggerFileUpload({
      id: 2,
      name: 'second.txt',
      data: new Blob(['b']),
    });
    closeWindow(host, popupWindow.id);
    await expect(later).rejects.toThrow('Popup window was closed prematurely.');
  });
});
