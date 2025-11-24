import { useSendConfig } from '@send-frontend/composables/useSendConfig';
import { trpc } from '@send-frontend/lib/trpc';
import { useExtensionStore } from '@send-frontend/stores';
import { onMounted, onUnmounted, ref } from 'vue';
import { useVerificationStore } from '../stores/verification-store';

export const useAutoConfigureAddon = () => {
  const codeVerification = ref<string | null>(null);

  const { handleSuccessfulVerificationForNewClient } = useVerificationStore();
  const { configureExtension } = useExtensionStore();
  const { useLoginQuery } = useSendConfig();

  const verifyCode = async (data: { code: string }) => {
    if (!data || !data.code) {
      console.error('Verification failed: no code provided');
      return;
    }
    codeVerification.value = data.code;
    // reload page
    // window.location.reload();
    // router.back(); // Navigate back after verification
  };

  function initialize() {
    useLoginQuery();

    trpc.onVerificationFinished.subscribe(
      // This code is unused but it might be useful to tell which client is making the request in the future
      { code: 'data.value' },
      {
        onData: verifyCode,
      }
    );

    // This is the final step. After the existing client has verified that the new client is trusted, they will share their encrypted passphrase and trigger this event.
    trpc.onPassphraseShared.subscribe(
      // This code is unused but it might be useful to tell which client is making the request in the future
      { code: 'data.value' },
      {
        onData: async (pars) => {
          await handleSuccessfulVerificationForNewClient(
            pars,
            codeVerification.value
          );
          await configureExtension();
        },
      }
    );
  }

  onUnmounted(() => {
    // initialize();
    console.log('🔴 Unmounting dashboard');
  });

  onMounted(initialize);
};
