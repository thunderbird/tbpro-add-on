import { useApiStore, useAuthStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { validateToken } from './validations';

export function useAuth() {
  const { api } = useApiStore();
  const authStore = useAuthStore();
  const { isLoggedIn } = storeToRefs(authStore);

  const { refetch } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      isLoggedIn.value = await validateToken(api);
    },
  });

  return {
    isLoggedIn,
    refetchAuth: refetch,
  };
}
