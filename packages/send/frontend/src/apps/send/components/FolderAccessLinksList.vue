<script setup lang="ts">
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import config from '@send-frontend/config';
import { trpc } from '@send-frontend/lib/trpc';
import { getDaysUntilDate } from '@send-frontend/lib/utils';
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
const linkToDelete = ref<string | null>(null);
const { copy, copied } = useClipboard({ copiedDuring: 1500 });
const lastCopiedLinkId = ref<string | null>(null);

function shareUrlFor(linkId: string): string {
  return `${config.sendClientUrl}/share/${linkId}`;
}

function copyShareUrl(linkId: string) {
  lastCopiedLinkId.value = linkId;
  copy(shareUrlFor(linkId));
}

watchEffect(async () => {
  await sharingStore.fetchFolderAccessLinks(props.folderId);
});

const { mutate } = useMutation({
  mutationFn: async () => {
    if (!linkToDelete.value) {
      return false;
    }
    const deleteMutation = await trpc.deleteAccessLink.mutate({
      linkId: linkToDelete.value,
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
The server keeps no copy of a link's secret. For a passwordless link the
secret lives only in the URL fragment shown once at creation (see
NewAccessLink.vue), so it can never be redisplayed here. A password-protected
link's URL carries no secret of its own (the password is supplied separately
by the recipient), so it's safe to reconstruct and re-copy from the link id
at any time.
*/
</script>
<template>
  <div
    v-if="sharingStore.links.length > 0"
    class="flex flex-col gap-1"
    data-testid="existing-links-header"
  >
    <span class="text-xs font-semibold text-gray-600">Existing Links</span>
  </div>
  <section
    v-for="(link, index) in sharingStore.links"
    :key="link.id"
    class="flex flex-col gap-1"
    :data-testid="`access-link-item-${index}`"
    :data-link-id="link.id"
  >
    <div class="flex gap-2 items-center">
      <input
        v-if="link.hasPassword"
        readonly
        class="flex-1 min-w-0 font-mono text-xs text-gray-700 cursor-pointer"
        :value="shareUrlFor(link.id)"
        :data-testid="`link-${index}`"
        aria-label="Share link"
        @click="
          ($event.target as HTMLInputElement).select();
          copyShareUrl(link.id);
        "
      />
      <span
        v-else
        v-tooltip="
          'Links without a password can only be viewed upon creation. You can delete this link to revoke access and create a new one anytime.'
        "
        class="flex-1 min-w-0 truncate font-mono text-xs text-gray-700"
        :title="link.id"
        :data-testid="`link-${index}`"
      >
        {{ link.id }}
      </span>
      <span
        v-if="copied && lastCopiedLinkId === link.id"
        class="text-xs text-gray-500"
      >
        Copied!
      </span>
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
        v-if="link.hasPassword"
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
