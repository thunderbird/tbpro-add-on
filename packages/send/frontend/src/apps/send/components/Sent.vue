<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, onMounted, ref, toRaw } from 'vue';

// TODO: after proof-of-concept, move these to the sharing-store
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import useUserStore from '@send-frontend/stores/user-store';

const { user } = useUserStore();
const sharingStore = useSharingStore();

const sent = ref([]);
// const foldersByRecipientId = computed(() => groupByRecipient(toRaw(sent.value)));
// const emailsByRecipientId = computed(() => createEmailMap(toRaw(sent.value)));
const shareOnlyFolders = computed(() =>
  toRaw(sent.value).filter(({ container }) => container.shareOnly)
);

async function getSentFolders() {
  const resp = await sharingStore.getFoldersSharedByUser(user.id);
  console.log(resp);
  sent.value = resp.map(({ accessLinks, container }) => ({
    accessLinks,
    container,
  }));
}
onMounted(getSentFolders);

// function createEmailMap(arr) {
//   if (arr.length === 0) {
//     return new Map();
//   }
//   const emailMap = new Map();
//   arr.forEach(({ sender }) => {
//     emailMap.set(sender.id, sender.email);
//   });
//   return emailMap;
// }

// function groupByRecipient(arr) {
//   if (arr.length === 0) {
//     return new Map();
//   }
//   const recipientMap = new Map();
//   const seen = {};
//   arr.forEach(({ sender, container }) => {
//     if (seen[container.id]) {
//       return;
//     }
//     seen[container.id] = true;
//     const containers = recipientMap.get(sender.id) ?? [];
//     recipientMap.set(sender.id, [...containers, container]);
//   });
// }
</script>

<template>
  <h1>stuff you've shared</h1>
  <ul>
    <li
      v-for="{ container, accessLinks } in shareOnlyFolders"
      :key="container.id"
    >
      {{ container }}: {{ accessLinks.length }}
    </li>
  </ul>
</template>
