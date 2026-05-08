<script lang="ts" setup>
import { useApiStore } from '@send-frontend/stores';
import { onMounted, ref } from 'vue';

type AdminUser = { id: string; email: string };

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
    loadError.value = 'Failed to load users.';
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
    deleteError.value = 'Delete failed. Please try again.';
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
    <h1 class="title">Delete User Data</h1>

    <div v-if="isLoading" class="status-text">Loading users…</div>

    <div v-else-if="loadError" class="error-text">{{ loadError }}</div>

    <!-- Success confirmation -->
    <div v-else-if="deleted" class="confirm-box">
      <p class="success-text">
        User data for <strong>{{ selectedUser?.email }}</strong> was
        successfully deleted.
      </p>
      <div class="actions">
        <button class="btn-cancel" @click="resetAfterDelete">
          Back to user list
        </button>
      </div>
    </div>

    <!-- Confirmation step -->
    <div v-else-if="selectedUser && confirmed" class="confirm-box">
      <p class="warning">
        This will permanently delete all data for
        <strong>{{ selectedUser.email }}</strong
        >. This cannot be undone.
      </p>
      <p class="confirm-text">Are you sure?</p>
      <p v-if="deleteError" class="error-text">{{ deleteError }}</p>
      <div class="actions">
        <button class="btn-danger" :disabled="isDeleting" @click="handleDelete">
          {{ isDeleting ? 'Deleting…' : 'Yes, delete everything' }}
        </button>
        <button
          class="btn-cancel"
          :disabled="isDeleting"
          @click="confirmed = false"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Selected user — first confirmation prompt -->
    <div v-else-if="selectedUser" class="confirm-box">
      <p class="warning">
        You are about to delete all data for
        <strong>{{ selectedUser.email }}</strong
        >.
      </p>
      <div class="actions">
        <button class="btn-danger" @click="confirmed = true">Continue</button>
        <button class="btn-cancel" @click="cancelSelection">Cancel</button>
      </div>
    </div>

    <!-- User list -->
    <div v-else>
      <p class="hint">Select a user to delete their data.</p>
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
      <p v-if="users.length === 0" class="status-text">No users found.</p>
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
  color: #000;
}

.hint {
  font-size: 13px;
  color: #555;
  margin-bottom: 0.5rem;
}

.status-text {
  font-size: 13px;
  color: #555;
}

.warning {
  font-size: 13px;
  color: #c0392b;
}

.error-text {
  font-size: 13px;
  color: #c0392b;
}

.success-text {
  font-size: 13px;
  color: #27ae60;
}

.confirm-box {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.confirm-text {
  font-size: 13px;
  font-weight: 500;
  color: #000;
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
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  gap: 1rem;
}

.user-row:hover {
  background: #fef2f2;
  border-color: #c0392b;
}

.user-email {
  color: #000;
  font-weight: 500;
}

.user-id {
  color: #888;
  font-size: 11px;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.btn-danger {
  padding: 0.5rem 1rem;
  background: #c0392b;
  color: #fff;
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
  color: #333;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
