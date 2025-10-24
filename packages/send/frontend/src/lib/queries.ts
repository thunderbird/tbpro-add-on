import { useApiStore } from '@send-frontend/stores';
import { STORAGE_LIMIT_EXCEEDED } from './errorMessages';

export const canUploadQuery = async () => {
  const { api } = useApiStore();
  const canUpload = await api.call('uploads/can-upload');

  if (!canUpload) {
    throw new Error(STORAGE_LIMIT_EXCEEDED);
  }

  return canUpload;
};
