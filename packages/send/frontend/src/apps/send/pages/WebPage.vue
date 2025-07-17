<script setup lang="ts">
import Home from '@send-frontend/apps/send/views/HomeView.vue';
import { DayJsKey } from '@send-frontend/types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { provide } from 'vue';

dayjs.extend(relativeTime);
provide(DayJsKey, dayjs);
</script>

<template>
  <Home />
</template>
