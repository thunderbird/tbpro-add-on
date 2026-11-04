<script setup lang="ts">
const { percentage } = defineProps<{
  percentage: number;
}>();
</script>
<template>
  <div>
    <div class="progress-bar-container">
      <div class="progress-bar" :style="{ width: percentage + '%' }"></div>
    </div>
  </div>
</template>

<style scoped>
.progress-bar-container {
  width: 100%;
  height: 12px;
  background-color: var(--colour-surface-deep);
  border-radius: 64px;
  overflow: hidden;
  margin-top: 0.5rem;
}

.progress-bar {
  border: solid 1px rgba(255, 255, 255, 0.1);
  border-radius: 64px;
  height: 100%;
  box-shadow: inset 0 3px 3px 0 rgba(255, 255, 255, 0.2);
  background-image: linear-gradient(
    to right,
    var(--colour-accent-blue) 58%,
    var(--colour-accent-purple) 118%,
    var(--colour-accent-pink) 118%
  );
  transition: width 0.3s ease;
}
</style>
