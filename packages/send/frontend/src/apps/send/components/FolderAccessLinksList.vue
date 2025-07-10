<script setup lang="ts">
import { BASE_URL } from '@/apps/common/constants';
import useSharingStore from '@/apps/send/stores/sharing-store';
import { trpc } from '@/lib/trpc';
import {
  getAccessLinkWithoutPasswordHash,
  getDaysUntilDate,
} from '@/lib/utils';
import { useMutation } from '@tanstack/vue-query';
import { ExpiryBadge, ExpiryUnitTypes } from '@thunderbirdops/services-ui';
import { useClipboard } from '@vueuse/core';
import { vTooltip } from 'floating-vue';
import { ref, watchEffect } from 'vue';

type Props = {
  folderId: string;
};

const sharingStore = useSharingStore();
const props = defineProps<Props>();
const clipboard = useClipboard();
const linkToDelete = ref<string | null>(null);

const tooltipText = ref('Click to copy');

watchEffect(async () => {
  await sharingStore.fetchFolderAccessLinks(props.folderId);
});

function copyToClipboard(id: string) {
  clipboard.copy(`${BASE_URL}/share/${id}`);
  tooltipText.value = 'Copied!';
  setTimeout(() => {
    tooltipText.value = 'Click to copy';
  }, 3000);
}

const { mutate } = useMutation({
  mutationFn: async () => {
    const formattedAccessLink = getAccessLinkWithoutPasswordHash(
      linkToDelete.value
    );
    const deleteMutation = await trpc.deleteAccessLink.mutate({
      linkId: formattedAccessLink,
    });

    if (deleteMutation.success) {
      await sharingStore.fetchFolderAccessLinks(props.folderId);
      linkToDelete.value = null;
      return true;
    }
    return false;
  },
});

function handleDeleteLink(linkId: string) {
  linkToDelete.value = linkId;
  return mutate();
}

/*
A note: we don't store the password.
So, the user has the option to change the expiration
and the user can delete the link.

But, there's no way to change the password, yet.
Theoretically, they can generate a new access link (and delete this one).

TODO: implement "regeneration" of links
*/
</script>
<template>
  <span
    v-if="sharingStore.links.length > 0"
    class="text-xs font-semibold text-gray-600"
    >Existing Links</span
  >
  <section
    v-for="(link, index) in sharingStore.links"
    :key="link.id"
    class="flex flex-col gap-3"
    :data-testid="`access-link-item-${index}`"
  >
    <div class="flex gap-2">
      <input
        v-tooltip="tooltipText"
        type="text"
        :value="`${BASE_URL}/share/${link.id}`"
        :data-testid="`link-${index}`"
        class="flex-1"
        @click="copyToClipboard(link.id)"
      />
      <button
        v-tooltip="'Delete link'"
        class="text-red-500 hover:text-red-700 px-2"
        :data-testid="`delete-link-button-${index}`"
        @click="handleDeleteLink(link.id)"
      >
        🗑️
      </button>
    </div>
    <div class="flex gap-2" data-testid="link-status">
      <div>
        <ExpiryBadge
          v-if="link.expiryDate"
          :time-remaining="getDaysUntilDate(link.expiryDate)"
          :warning-threshold="10"
          :time-unit="ExpiryUnitTypes.Days"
          class="my-2"
        />
      </div>
      <div
        v-if="!link.passwordHash"
        class="flex text-xs justify-center self-center"
        data-testid="link-with-password"
      >
        <div>🔐</div>
        <div>Password</div>
      </div>
      <div v-if="link.locked" class="flex text-xs justify-center self-center">
        <div>⛔️</div>
        <div>Locked</div>
      </div>
    </div>
  </section>
</template>
