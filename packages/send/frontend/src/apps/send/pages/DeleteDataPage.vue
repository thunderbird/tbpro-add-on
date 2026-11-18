<script lang="ts" setup>
import { useL10n } from '@send-frontend/l10n';
import { useApiStore } from '@send-frontend/stores';
import { onMounted, ref } from 'vue';

type AdminUser = { id: string; email: string };

const { t, tAround } = useL10n();
const { api } = useApiStore();

const users = ref<AdminUser[]>([]);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

const selectedUser = ref<AdminUser | null>(null);
const confirmed = ref(false);
const isDeleting = ref(false);
const deleteError = ref<string | null>(null);
const deleted = ref(false);

onMounted(async () => {
  try {
    const result = await api.call<AdminUser[]>('users/all-users');
    users.value = result ?? [];
  } catch {
    loadError.value = t('send-admin-load-failed');
  } finally {
    isLoading.value = false;
  }
});

function selectUser(user: AdminUser) {
  selectedUser.value = user;
  confirmed.value = false;
  deleteError.value = null;
}

function cancelSelection() {
  selectedUser.value = null;
  confirmed.value = false;
  deleteError.value = null;
}

async function handleDelete() {
  if (!selectedUser.value) return;
  isDeleting.value = true;
  deleteError.value = null;
  try {
    await api.call(`users/${selectedUser.value.id}`, {}, 'DELETE');
    deleted.value = true;
    users.value = users.value.filter((u) => u.id !== selectedUser.value!.id);
  } catch {
    deleteError.value = t('send-admin-delete-failed');
  } finally {
    isDeleting.value = false;
  }
}

function resetAfterDelete() {
  selectedUser.value = null;
  confirmed.value = false;
  deleted.value = false;
}
</script>

<template>
  <main class="container">
    <h1 class="title">{{ t('send-admin-title') }}</h1>

    <div v-if="isLoading" class="status-text">
      {{ t('send-admin-loading') }}
    </div>

    <div v-else-if="loadError" class="error-text">{{ loadError }}</div>

    <!-- Success confirmation -->
    <div v-else-if="deleted" class="confirm-box">
      <p class="success-text">
        {{ tAround('send-admin-deleted', 'email')[0]
        }}<strong>{{ selectedUser?.email }}</strong
        >{{ tAround('send-admin-deleted', 'email')[1] }}
      </p>
      <div class="actions">
        <button class="btn-cancel" @click="resetAfterDelete">
          {{ t('send-admin-back') }}
        </button>
      </div>
    </div>

    <!-- Confirmation step -->
    <div v-else-if="selectedUser && confirmed" class="confirm-box">
      <p class="warning">
        {{ tAround('send-admin-final-warning', 'email')[0]
        }}<strong>{{ selectedUser.email }}</strong
        >{{ tAround('send-admin-final-warning', 'email')[1] }}
      </p>
      <p class="confirm-text">{{ t('send-admin-are-you-sure') }}</p>
      <p v-if="deleteError" class="error-text">{{ deleteError }}</p>
      <div class="actions">
        <button class="btn-danger" :disabled="isDeleting" @click="handleDelete">
          {{
            t('send-admin-delete-button', {
              state: isDeleting ? 'deleting' : 'idle',
            })
          }}
        </button>
        <button
          class="btn-cancel"
          :disabled="isDeleting"
          @click="confirmed = false"
        >
          {{ t('send-admin-cancel') }}
        </button>
      </div>
    </div>

    <!-- Selected user — first confirmation prompt -->
    <div v-else-if="selectedUser" class="confirm-box">
      <p class="warning">
        {{ tAround('send-admin-first-warning', 'email')[0]
        }}<strong>{{ selectedUser.email }}</strong
        >{{ tAround('send-admin-first-warning', 'email')[1] }}
      </p>
      <div class="actions">
        <button class="btn-danger" @click="confirmed = true">
          {{ t('send-admin-continue') }}
        </button>
        <button class="btn-cancel" @click="cancelSelection">
          {{ t('send-admin-cancel') }}
        </button>
      </div>
    </div>

    <!-- User list -->
    <div v-else>
      <p class="hint">{{ t('send-admin-hint') }}</p>
      <ul class="user-list">
        <li
          v-for="user in users"
          :key="user.id"
          class="user-row"
          @click="selectUser(user)"
        >
          <span class="user-email">{{ user.email }}</span>
          <span class="user-id">{{ user.id }}</span>
        </li>
      </ul>
      <p v-if="users.length === 0" class="status-text">
        {{ t('send-admin-no-users') }}
      </p>
    </div>
  </main>
</template>

<style scoped>
.container {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 560px;
  margin: 2rem auto;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--colour-ti-base);
}

.hint {
  font-size: 13px;
  color: var(--colour-ti-secondary);
  margin-bottom: 0.5rem;
}

.status-text {
  font-size: 13px;
  color: var(--colour-ti-secondary);
}

.warning {
  font-size: 13px;
  color: var(--colour-ti-critical);
}

.error-text {
  font-size: 13px;
  color: var(--colour-ti-critical);
}

.success-text {
  font-size: 13px;
  color: var(--colour-ti-success);
}

.confirm-box {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.confirm-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--colour-ti-base);
}

.actions {
  display: flex;
  gap: 0.75rem;
}

.user-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--colour-surface-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  gap: 1rem;
}

.user-row:hover {
  background: var(--colour-critical-soft);
  border-color: var(--colour-critical-default);
}

.user-email {
  color: var(--colour-ti-base);
  font-weight: 500;
}

.user-id {
  color: var(--colour-ti-muted);
  font-size: 11px;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.btn-danger {
  padding: 0.5rem 1rem;
  background: var(--colour-critical-default);
  color: var(--colour-ti-base-inverted);
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  padding: 0.5rem 1rem;
  background: transparent;
  color: var(--colour-ti-base);
  border: 1px solid var(--colour-surface-border);
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
