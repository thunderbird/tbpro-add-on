<script setup lang="ts">
import { computed } from 'vue';

const emit = defineEmits(['openEmailMessage']);

const props = defineProps({
  summary: Object,
});

const summaryObj = computed(() => {
  if (typeof props.summary === 'string') {
    return JSON.parse(props.summary);
  }

  return props.summary || {};
});
</script>

<template>
  <div class="daily-brief">
    <div v-if="summaryObj.action?.length > 0">
      <h3>Action Items</h3>
      <ul>
        <li v-for="item in summaryObj.action" :key="item.headerMessageId">
          {{ item.summary }}
          <br />
          <button
            :title="item.headerMessageId"
            @click="emit('openEmailMessage', item.headerMessageId)"
          >
            view message
          </button>
        </li>
      </ul>
    </div>
    <div v-if="summaryObj.highlight?.length > 0">
      <h3>Highlights</h3>
      <ul>
        <li v-for="item in summaryObj.highlight" :key="item.headerMessageId">
          {{ item.summary }}
          <br />
          <button
            :title="item.headerMessageId"
            @click="emit('openEmailMessage', item.headerMessageId)"
          >
            view message
          </button>
        </li>
      </ul>
    </div>
    <div v-if="summaryObj.miscellaneous?.length > 0">
      <h3>Additional Information</h3>
      <ul>
        <li v-for="item in summaryObj.miscellaneous" :key="item.headerMessageId">
          {{ item.summary }}
          <br />
          <button
            :title="item.headerMessageId"
            @click="emit('openEmailMessage', item.headerMessageId)"
          >
            view message
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
header,
main {
  display: block;
}

h3 {
  margin-top: 2.2rem;
}

li b {
  font-weight: bolder;
}
</style>
