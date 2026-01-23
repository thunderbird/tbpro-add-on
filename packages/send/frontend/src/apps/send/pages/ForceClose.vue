<script lang="ts" setup>
import { FORCE_CLOSE_WINDOW } from '@send-frontend/lib/const';
import { onMounted } from 'vue';

onMounted(() => {
  console.log('ForceClose mounted, requesting addon to close window...');

  // Try to close via addon bridge first
  try {
    window.postMessage({ type: FORCE_CLOSE_WINDOW }, window.location.origin);
    console.log('Sent FORCE_CLOSE_WINDOW message to addon');
  } catch (error) {
    console.error('Error sending FORCE_CLOSE_WINDOW message:', error);
  }

  // Fallback to direct window.close() after a short delay
  setTimeout(() => {
    console.log('Fallback: attempting direct window.close()');
    window.close();
  }, 1000);
});
</script>
