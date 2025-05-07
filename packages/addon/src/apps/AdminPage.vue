<script setup lang="ts">
import SendManagement from 'send-frontend/src/apps/send/ManagementPage.vue';
import logger from 'send-frontend/src/logger';
import { logger as sharedLogger } from 'tbpro-shared';
import { onMounted, ref } from 'vue';

const showSend = ref(true);
const showAssist = ref(false);

onMounted(() => {
  // check that imports from send-frontend work
  logger.info('ManagementPage mounted logging frontend');
  // check that imports from tbpro-shared work
  sharedLogger.info('ManagementPage mounted logging shared');
});
</script>

<template>
  <h1 data-testid="tbpro-heading">TB Pro Services</h1>
  <div class="toggle-group">
    <label class="toggle">
      <input
        v-model="showSend"
        type="checkbox"
        class="toggle-input"
        data-testid="toggle-send"
      />
      <span class="toggle-slider"></span>
      <span class="toggle-label" data-testid="label-send">Send</span>
    </label>
    <label class="toggle" style="margin-left: 1.5em">
      <input
        v-model="showAssist"
        type="checkbox"
        class="toggle-input"
        data-testid="toggle-assist"
      />
      <span class="toggle-slider"></span>
      <span class="toggle-label" data-testid="label-assist">Assist</span>
    </label>
  </div>

  <div v-if="showSend" data-testid="send-section">
    <SendManagement />
  </div>

  <div v-if="showAssist" data-testid="assist-section">
    <h2>Assist</h2>
    <p>Assist service coming soon...</p>
  </div>
</template>
<style scoped>
.toggle-group {
  display: flex;
  align-items: center;
  margin-bottom: 1.5em;
}
.toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  position: relative;
  user-select: none;
}
.toggle-input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.toggle-slider {
  width: 40px;
  height: 22px;
  background: #cbd5e1;
  border-radius: 22px;
  position: relative;
  transition: background 0.2s;
  margin-right: 0.75em;
}
.toggle-input:checked + .toggle-slider {
  background: #2563eb;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.toggle-input:checked + .toggle-slider::before {
  transform: translateX(18px);
}
.toggle-label {
  font-size: 1rem;
  color: #1e293b;
  font-weight: 500;
}
</style>
