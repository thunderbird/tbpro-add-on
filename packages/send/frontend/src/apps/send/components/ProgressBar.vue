<script setup lang="ts">
import { onUnmounted } from 'vue';
import { useStatusStore } from '../stores/status-store';

const { progress } = useStatusStore();

onUnmounted(() => {
  progress.initialize();
});
</script>
<template>
  <div class="progress-content">
    <h2 class="title">{{ progress.text }}</h2>
    <div class="progress-bar-container">
      <div
        class="progress-bar"
        :style="{ width: progress.percentage + '%' }"
      ></div>
    </div>
    <span class="progress-percentage">{{ progress.percentage }}%</span>
  </div>
</template>

<style scoped>
.progress-content {
  position: relative;
  width: clamp(200px, 75vw, 800px);
}

.title {
  font-size: 1.5rem;
  font-weight: 500;
  color: #4285f4;
  margin: 0 0 1.5rem 0;
}

.progress-text {
  color: #333;
  margin: 0 0 1rem 0;
}

.progress-bar-container {
  width: 100%;
  height: 8px;
  background-color: #e5e5e5;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-bar {
  height: 100%;
  background-color: #4285f4;
  transition: width 0.3s ease;
  border-radius: 4px;
}

.progress-percentage {
  color: #666;
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
