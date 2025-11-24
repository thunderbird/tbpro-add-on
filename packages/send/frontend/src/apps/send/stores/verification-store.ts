import { getUUID, Util } from '@send-frontend/lib/keychain';
import { trpc } from '@send-frontend/lib/trpc';

import { validateBackedUpKeys } from '@send-frontend/lib/validations';
import { useKeychainStore, useUserStore } from '@send-frontend/stores';
import { defineStore } from 'pinia';
import { ref } from 'vue';

const sessionUUID = getUUID();

export const useVerificationStore = defineStore('verification', () => {
  const generatedCode = ref<string | null>(null);
  const userStore = useUserStore();
  const { keychain } = useKeychainStore();
  const isDeviceAskingForVerification = ref(false);

  console.log(
    '💬 Verification Store initialized with session UUID:',
    sessionUUID
  );

  async function validateActiveClient() {
    return await validateBackedUpKeys(userStore.getBackup, keychain);
  }

  async function handleSuccessfulVerificationForExistingClient(code: string) {
    console.log(
      '🔐 Handling successful verification for existing client with code:',
      code
    );
    const passphrase = keychain.getPassphraseValue();

    // Generate a key for encrypting the passphrase using the code
    const encryptionKey = await keychain.challenge.generateKey();

    // Generate salts for encryption
    const salt = Util.generateSalt();
    const codeSalt = Util.generateSalt();

    // Encrypt the passphrase using the challenge encryption method
    const encryptedPassphrase = await keychain.challenge.encryptChallenge(
      passphrase,
      encryptionKey,
      //@ts-ignore
      salt
    );

    // Use the code as a password to wrap the encryption key
    const wrappedEncryptionKey = await keychain.password.wrapContentKey(
      encryptionKey,
      code,
      //@ts-ignore
      codeSalt
    );

    // Convert salts to base64 strings for transmission
    const saltStr = Util.arrayBufferToBase64(salt);
    const codeSaltStr = Util.arrayBufferToBase64(codeSalt);

    // Return the encrypted data that can be sent to the server
    // The receiving client can use the code to unwrap the encryption key,
    // then use that key to decrypt the passphrase
    const payload = {
      encryptedPassphrase,
      wrappedEncryptionKey,
      salt: saltStr,
      codeSalt: codeSaltStr,
    };
    const id = await trpc.shareEncryptedPassphrase.mutate(payload);
    console.log('Successfully shared encrypted passphrase with ID:', id);
    return id;
  }

  async function handleSuccessfulVerificationForNewClient(
    response: {
      id: string;
    },
    code: string
  ) {
    try {
      const data = await trpc.getEncryptedPassphrase.query(response.id);
      if (!data) {
        console.error('No encrypted passphrase found for the provided code');
        return;
      }

      const decryptedPassphrase = await decryptPassphraseWithCode(
        //@ts-ignore
        {
          ...data, // Ensure the data matches the expected type
        },
        code
      );
      // This function would be called on the receiving client to decrypt
      // the passphrase using the code provided during verification
      await keychain.storePassPhrase(decryptedPassphrase);
      console.log('🗝️ Passphrase successfully decrypted and stored.');
      return decryptedPassphrase;
    } catch (error) {
      console.error('Error retrieving encrypted passphrase:', error);
    }
  }

  // Helper function to decrypt a passphrase that was encrypted with the code
  async function decryptPassphraseWithCode(
    encryptedData: {
      encryptedPassphrase: string;
      wrappedEncryptionKey: string;
      salt: string;
      codeSalt: string;
    },
    code: string
  ): Promise<string> {
    // Convert base64 salts back to ArrayBuffer
    const salt = Util.base64ToArrayBuffer(encryptedData.salt);
    const codeSalt = Util.base64ToArrayBuffer(encryptedData.codeSalt);

    // Use the code to unwrap the encryption key
    const encryptionKey = await keychain.password.unwrapContentKey(
      encryptedData.wrappedEncryptionKey,
      code,
      //@ts-ignore
      codeSalt
    );

    // Use the unwrapped key to decrypt the passphrase
    const decryptedPassphrase = await keychain.challenge.decryptChallenge(
      encryptedData.encryptedPassphrase,
      encryptionKey,
      //@ts-ignore
      salt
    );

    return decryptedPassphrase;
  }

  const verifyCode = async (data: { code: string }) => {
    try {
      const hasValidPassphrase = await validateActiveClient();

      if (data?.code !== sessionUUID && hasValidPassphrase) {
        isDeviceAskingForVerification.value.value = true;
        console.warn(
          'A new device wants to authenticate. Do you want to verify it?.'
        );

        // push('/verify');
        if (!data || !data.code) {
          console.error('Verification failed: no code provided');
          return;
        }
      }
    } catch (error) {
      console.error('Verification failed:', error);
    }
  };

  // We listen for verification events
  trpc.onVerificationRequested.subscribe(
    { code: sessionUUID },
    {
      onData: verifyCode,
    }
  );

  return {
    // Session
    sessionUUID,
    generatedCode,

    // Methods
    handleSuccessfulVerificationForNewClient,
    handleSuccessfulVerificationForExistingClient,

    // Utility methods
    decryptPassphraseWithCode,
    // State
    isDeviceAskingForVerification,
  };
});

export type ConfigStore = ReturnType<typeof useVerificationStore>;
