<script setup lang="ts">
import {
  PermissionsMap,
  PermissionsTable,
} from '@send-frontend/lib/permissions';
import { ref } from 'vue';

const props = defineProps({
  // eslint-disable-next-line vue/require-default-prop
  currentPermission: Number,
});

const emit = defineEmits(['setPermission']);

const selected = ref(props.currentPermission);

function setPermission(event) {
  emit('setPermission', event.target.value);
}
</script>

<template>
  <select v-model="selected" @change="setPermission">
    <option v-for="p of Object.values(PermissionsMap)" :key="p" :value="p">
      {{ PermissionsTable[p] }}
    </option>
  </select>
</template>
