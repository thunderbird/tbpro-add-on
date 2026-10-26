import { ApiCallFailure, ApiConnection } from '@send-frontend/lib/api';
import { Keychain, Util } from '@send-frontend/lib/keychain';

export type ChallengeRefusal =
  | { status: 'incorrect'; attemptsRemaining?: number }
  | { status: 'locked' }
  | { status: 'failed' };

export type ChallengeResult =
  | { status: 'accepted'; unwrappedKey: CryptoKey; containerId: string }
  | ChallengeRefusal;

const FAILED: ChallengeRefusal = { status: 'failed' };

// POST /challenge answers 401 for an incorrect password and 423 for a locked link.
function refusalFromFailure(failure?: ApiCallFailure): ChallengeRefusal {
  if (failure?.status === 423) {
    return { status: 'locked' };
  }
  if (failure?.status !== 401) {
    return FAILED;
  }
  let attemptsRemaining: unknown;
  try {
    attemptsRemaining =
      failure.kind === 'http'
        ? JSON.parse(failure.body).attemptsRemaining
        : undefined;
  } catch {
    attemptsRemaining = undefined;
  }
  return Number.isInteger(attemptsRemaining)
    ? { status: 'incorrect', attemptsRemaining: attemptsRemaining as number }
    : { status: 'incorrect' };
}

export async function getContainerKeyFromChallenge(
  hash: string,
  password: string,
  api: ApiConnection,
  keychain: Keychain
): Promise<ChallengeResult> {
  const resp = await api.call<{
    challengeKey: string;
    challengeSalt: string;
    challengeCiphertext: string;
  }>(`sharing/${hash}/challenge`);

  if (!resp) {
    return FAILED;
  }

  // Step 1: receive the challenge info,
  // renaming each property so it's clear that we're working with strings.
  const {
    challengeKey: challengeKeyStr,
    challengeSalt: challengeSaltStr,
    challengeCiphertext,
  } = resp;

  // Step 2: convert to array buffers, as necessary.
  // Only the salt needs to be converted to an array buffer.
  // This is handled automatically by keychain.password.unwrapContentKey
  let challengeSalt: ArrayBufferLike;
  try {
    challengeSalt = Util.base64ToArrayBuffer(challengeSaltStr);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return FAILED;
  }

  // Steps 3-4: unwrap the challenge key and decrypt the challenge. A wrong
  // password yields '', which we still post so the server counts the attempt
  // and locks the link when due.
  const challengePlaintext = await solveChallenge(
    keychain,
    password,
    challengeKeyStr,
    challengeCiphertext,
    challengeSalt
  );

  try {
    // Step 5: post the challenge text to receive:
    // - containerId
    // - wrapped container key
    // - salt (for unwrapping container key)
    let failure: ApiCallFailure | undefined;
    const challengeResp = await api.call<{
      status: string;
      containerId: string;
      wrappedKey: string;
      salt: string;
    }>(
      `sharing/${hash}/challenge`,
      {
        challengePlaintext,
      },
      'POST',
      {},
      // A 401 here is a wrong password; replaying the POST would count it twice.
      { skipAuthRetry: true, onFailure: (f) => (failure = f) }
    );

    if (!challengeResp) {
      return refusalFromFailure(failure);
    }
    if (!challengePlaintext || !challengeResp.containerId) {
      return FAILED;
    }
    const {
      containerId,
      wrappedKey: wrappedKeyStr,
      salt: saltStr,
    } = challengeResp;

    // Step 6: unwrap the container key using the password
    const unwrappedKey: CryptoKey = await keychain.password.unwrapContainerKey(
      wrappedKeyStr,
      password,
      Util.base64ToArrayBuffer(saltStr)
    );

    return { status: 'accepted', unwrappedKey, containerId };
  } catch (e) {
    console.log(e);
    return FAILED;
  }
}

async function solveChallenge(
  keychain: Keychain,
  password: string,
  challengeKeyStr: string,
  challengeCiphertext: string,
  challengeSalt: ArrayBuffer
): Promise<string> {
  try {
    const unwrappedChallengeKey: CryptoKey =
      await keychain.password.unwrapContentKey(
        challengeKeyStr,
        password,
        challengeSalt
      );
    return await keychain.challenge.decryptChallenge(
      challengeCiphertext,
      unwrappedChallengeKey,
      challengeSalt
    );
  } catch {
    return '';
  }
}
