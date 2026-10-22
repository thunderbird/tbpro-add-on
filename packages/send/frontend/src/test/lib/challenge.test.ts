import { ApiConnection } from '@send-frontend/lib/api';
import { getContainerKeyFromChallenge } from '@send-frontend/lib/challenge';
import { Keychain, Util } from '@send-frontend/lib/keychain';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The server counts failed access-link attempts on POST /challenge (#1006),
// so a wrong password must still complete the round-trip.

const LINK_ID = 'link-1';
const PASSWORD = 'correct-horse-battery';

const keychain = new Keychain();
let challenge: {
  challengeKey: string;
  challengeSalt: string;
  challengeCiphertext: string;
};
let challengePlaintext: string;
let accepted: { containerId: string; wrappedKey: string; salt: string };

const call = vi.fn();
const api = { call } as unknown as ApiConnection;

const posts = () => call.mock.calls.filter(([, , method]) => method === 'POST');

beforeAll(async () => {
  // Build a challenge exactly as Sharer.requestAccessLink does.
  const challengeKey = await keychain.challenge.generateKey();
  const challengeSalt = Util.generateSalt();
  challengePlaintext = keychain.challenge.createChallenge();
  challenge = {
    challengeKey: await keychain.password.wrapContentKey(
      challengeKey,
      PASSWORD,
      challengeSalt
    ),
    challengeSalt: Util.arrayBufferToBase64(challengeSalt),
    challengeCiphertext: await keychain.challenge.encryptChallenge(
      challengePlaintext,
      challengeKey,
      challengeSalt
    ),
  };

  const containerKey = await keychain.container.generateContainerKey();
  const salt = Util.generateSalt();
  accepted = {
    containerId: 'container-1',
    wrappedKey: await keychain.password.wrapContainerKey(
      containerKey,
      PASSWORD,
      salt
    ),
    salt: Util.arrayBufferToBase64(salt),
  };
});

beforeEach(() => {
  call.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('getContainerKeyFromChallenge', () => {
  it('posts the decrypted challenge and returns the container key for the right password', async () => {
    call
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ status: 'success', ...accepted });

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      PASSWORD,
      api,
      keychain
    );

    expect(posts()).toEqual([
      [`sharing/${LINK_ID}/challenge`, { challengePlaintext }, 'POST'],
    ]);
    expect(result?.containerId).toBe('container-1');
    expect(result?.unwrappedKey.algorithm.name).toBe('AES-KW');
  });

  it('still posts a non-matching answer for a wrong password and returns null', async () => {
    // The server refuses the answer (api.call returns null on a 4xx).
    call.mockResolvedValueOnce(challenge).mockResolvedValueOnce(null);

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      'wrong-password',
      api,
      keychain
    );

    expect(result).toBeNull();
    expect(posts()).toEqual([
      [`sharing/${LINK_ID}/challenge`, { challengePlaintext: '' }, 'POST'],
    ]);
  });

  it('returns null without posting when the challenge cannot be fetched', async () => {
    call.mockResolvedValueOnce(null);

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      PASSWORD,
      api,
      keychain
    );

    expect(result).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(0);
  });
});
