import logger from '@/logger';
import { useAuthStore } from '@/stores';

export async function mozAcctLogin() {
  const { loginToMozAccount } = useAuthStore();
  loginToMozAccount(() => logger.info('Login completed'));
}
