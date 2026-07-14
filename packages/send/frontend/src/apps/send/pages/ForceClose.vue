<script lang="ts" setup>
import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { forceCloseWindow } from '@send-frontend/lib/login';
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
const router = useRouter();
const { isRunningInsideThunderbird } = useIsExtension();

onMounted(() => {
  // When this page is loaded outside of Thunderbird, we can use the router to redirect to login
  if (!isRunningInsideThunderbird.value) {
    router.push('/login');
    return;
  }

  // Otherwise, close the window via the add-on bridge (with a window.close()
  // fallback).
  forceCloseWindow();
});
</script>
