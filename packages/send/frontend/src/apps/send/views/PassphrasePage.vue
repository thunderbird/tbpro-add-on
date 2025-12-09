<script setup lang="ts">
import { onMounted } from 'vue';
import PassphrasePDF from '../components/PassphrasePDF.vue';

onMounted(() => {
  window.print();
});
</script>

<template>
  <PassphrasePDF />
</template>
