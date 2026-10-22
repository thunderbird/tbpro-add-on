import { ApiConnection } from '@send-frontend/lib/api';
import { Keychain, Util } from '@send-frontend/lib/keychain';

export async function getContainerKeyFromChallenge(
  hash: string,
  password: string,
  api: ApiConnection,
  keychain: Keychain
): Promise<{
  unwrappedKey: CryptoKey;
  containerId: string;
} | null> {
  const resp = await api.call<{
    challengeKey: string;
    challengeSalt: string;
    challengeCiphertext: string;
  }>(`sharing/${hash}/challenge`);

  if (!resp) {
    return null;
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
    return null;
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
      'POST'
    );

    if (!challengePlaintext || !challengeResp?.containerId) {
      return null;
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

    return { unwrappedKey, containerId };
  } catch (e) {
    console.log(e);
    return null;
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
