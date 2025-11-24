import { useVerificationStore } from '@send-frontend/apps/send/stores/verification-store';
import { useApiStore } from '@send-frontend/stores';
import { useQuery } from '@tanstack/vue-query';
import { STORAGE_LIMIT_EXCEEDED } from './errorMessages';

export const canUploadQuery = async () => {
  const { api } = useApiStore();
  const canUpload = await api.call('uploads/can-upload');

  if (!canUpload) {
    throw new Error(STORAGE_LIMIT_EXCEEDED);
  }

  return canUpload;
};

export const generateVerificationCodeQuery = async () => {
  const { api } = useApiStore();
  const { sessionUUID } = useVerificationStore();
  const { data, refetch } = useQuery({
    queryKey: ['generateVerificationCode'],
    queryFn: async () => {
      // This api call emits the websocket event that triggers active clients to the verification page
      await api.call(`verify/request?code=${sessionUUID}`);
      const response = await api.call<{ code: string; createdAt: string }>(
        'verify/generate'
      );

      // Start countdown timer when we get a new code
      // startCountdown();

      return response.code;
    },
  });
  return { data, refetch };
};
