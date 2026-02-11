<script setup lang="ts">
import { useRoute } from 'vue-router';
import NavBar from '@send-frontend/apps/send/components/NavBar.vue';
import FooterBar from '@send-frontend/apps/send/components/FooterBar.vue';

const route = useRoute();
const isPrintMode = route.query.print !== undefined;
</script>

<template>
  <template v-if="isPrintMode">
    <slot></slot>
  </template>
  <template v-else>
    <NavBar />

    <div class="content">
      <slot></slot>
    </div>

    <FooterBar />
  </template>
</template>

<style lang="css" scoped>
.content {
  min-height: calc(100vh - 250px - 60px);
}
</style>
