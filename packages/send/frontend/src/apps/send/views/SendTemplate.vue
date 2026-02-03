<script setup lang="ts">
import { StandardFooter } from '@thunderbirdops/services-ui';
import { useRoute } from 'vue-router';
import NavBar from '../components/NavBar.vue';

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

    <StandardFooter
      contribute-to-this-site-url="https://github.com/thunderbird/tbpro-add-on"
    />
  </template>
</template>

<style lang="css" scoped>
.content {
  min-height: calc(100vh - 250px - 60px);
}
</style>
