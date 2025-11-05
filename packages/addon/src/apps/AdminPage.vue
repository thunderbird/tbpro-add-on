<script setup lang="ts">
import SendDashboardView from '@send-frontend/apps/send/views/SendDashboardView.vue';
import { computed, ref } from 'vue';

const showSend = ref(true);

const isTbproExtension = computed(() => __APP_NAME__ === 'addon');
console.log('isTbproExtension', isTbproExtension.value);
</script>

<template>
  <div class="admin-container">
    <h1 class="main-title" data-testid="tbpro-heading">Your Services</h1>
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
    </div>

    <div v-if="showSend" class="service-section" data-testid="send-section">
      <SendDashboardView :is-tbpro-extension="isTbproExtension" />
    </div>
  </div>
</template>
<style scoped>
.admin-container {
  width: 100%;
}

.main-title {
  font-size: 1.5rem;
  font-weight: 500;
  color: #333;
  margin: 0 0 1.5rem 0;
}

.toggle-group {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e5e5e5;
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
  margin-right: 0.75rem;
}

.toggle-input:checked + .toggle-slider {
  background: #4285f4;
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
  font-size: 0.9375rem;
  color: #333;
  font-weight: 500;
}

.service-section {
  margin-top: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 500;
  color: #333;
  margin: 0 0 1rem 0;
}

.info-text {
  color: #666;
  font-size: 0.9375rem;
  line-height: 1.6;
  margin: 0;
}
</style>
