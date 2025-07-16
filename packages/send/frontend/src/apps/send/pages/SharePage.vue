<script setup lang="ts">
import { ref } from 'vue';

import AcceptAccessLink from '@send-frontend/apps/send/views/AcceptAccessLink.vue';
import ViewShare from '@send-frontend/apps/send/views/ViewShare.vue';

const isViewShareReady = ref(false);

function acceptAccessLinkComplete() {
  isViewShareReady.value = true;
}
</script>

<template>
  <template v-if="isViewShareReady">
    <ViewShare />
  </template>
  <template v-else>
    <AcceptAccessLink @accept-access-link-complete="acceptAccessLinkComplete" />
  </template>
</template>
