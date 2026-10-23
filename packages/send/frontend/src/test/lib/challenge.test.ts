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
      [
        `sharing/${LINK_ID}/challenge`,
        { challengePlaintext },
        'POST',
        {},
        expect.objectContaining({ skipAuthRetry: true }),
      ],
    ]);
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.containerId).toBe('container-1');
    expect(result.unwrappedKey.algorithm.name).toBe('AES-KW');
  });

  // api.call returns null on a 4xx and reports it through onFailure.
  const refuseWith = (status: number, body = '') =>
    call
      .mockResolvedValueOnce(challenge)
      .mockImplementationOnce(async (_path, _body, _method, _headers, opts) => {
        opts.onFailure({ kind: 'http', status, statusText: '', body });
        return null;
      });

  it('still posts a non-matching answer for a wrong password and reports it as incorrect', async () => {
    refuseWith(
      401,
      JSON.stringify({ code: 'INCORRECT_PASSWORD', attemptsRemaining: 3 })
    );

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      'wrong-password',
      api,
      keychain
    );

    expect(result).toEqual({ status: 'incorrect', attemptsRemaining: 3 });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].slice(0, 3)).toEqual([
      `sharing/${LINK_ID}/challenge`,
      { challengePlaintext: '' },
      'POST',
    ]);
  });

  it('reports incorrect without a count when the 401 body has none', async () => {
    refuseWith(401, 'not json');

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      'wrong-password',
      api,
      keychain
    );

    expect(result).toEqual({ status: 'incorrect' });
  });

  it('reports a locked link on 423', async () => {
    refuseWith(423, JSON.stringify({ code: 'ACCESS_LINK_LOCKED' }));

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      PASSWORD,
      api,
      keychain
    );

    expect(result).toEqual({ status: 'locked' });
  });

  it('reports other refusals as a generic failure', async () => {
    refuseWith(404);

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      PASSWORD,
      api,
      keychain
    );

    expect(result).toEqual({ status: 'failed' });
  });

  it('fails without posting when the challenge cannot be fetched', async () => {
    call.mockResolvedValueOnce(null);

    const result = await getContainerKeyFromChallenge(
      LINK_ID,
      PASSWORD,
      api,
      keychain
    );

    expect(result).toEqual({ status: 'failed' });
    expect(call).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(0);
  });
});
