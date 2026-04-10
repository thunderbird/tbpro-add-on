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
  background-color: #e0e0e0;
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
    #58c9ff 58%,
    #ae55f7 118%,
    #e247c4 118%
  );
  transition: width 0.3s ease;
}
</style>
