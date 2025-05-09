// Import necessary stores and utilities
import { useApiStore, useAuthStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { validateToken } from './validations';

/**
 * useAuth is a composable that manages authentication state and actions.
 * It returns the login status and methods to refetch and log out.
 * It's important to note that this composable should only be used inside vue components.
 */
export function useAuth() {
  // Access the API and authentication stores
  const { api } = useApiStore();
  const authStore = useAuthStore();
  // Get a reactive reference to the login status
  const { isLoggedIn } = storeToRefs(authStore);

  // Set up a query to validate the session token and update login status
  const { refetch: refetchAuth } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      // Validate the token and update the logged in state
      isLoggedIn.value = await validateToken(api);
    },
  });

  // Log out by removing the auth token and updating login status
  const logOutAuth = async () => {
    await api.removeAuthToken();
    isLoggedIn.value = false;
  };

  // Expose the login status, refetch method, and logout function
  return {
    isLoggedIn,
    refetchAuth,
    logOutAuth,
  };
}
