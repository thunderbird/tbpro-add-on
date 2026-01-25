<script lang="ts" setup>
import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { FORCE_CLOSE_WINDOW } from '@send-frontend/lib/const';
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
const router = useRouter();
const { isRunningInsideThunderbird } = useIsExtension();

onMounted(() => {
  // When this page is loaded outside of Thunderbird, we can use the router to redirect to login
  if (!isRunningInsideThunderbird.value) {
    router.push('/login');
  }

  // Otherwise, attempt to close the window
  // Try to close via addon bridge first
  try {
    window.postMessage({ type: FORCE_CLOSE_WINDOW }, window.location.origin);
    console.log('Sent FORCE_CLOSE_WINDOW message to addon');
  } catch (error) {
    console.error('Error sending FORCE_CLOSE_WINDOW message:', error);
  }

  // Fallback to direct window.close() after a short delay
  window.close();
});
</script>
