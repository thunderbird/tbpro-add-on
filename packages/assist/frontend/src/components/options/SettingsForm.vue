<script setup lang="ts">
import { ref, watch, toRaw } from 'vue';

const props = defineProps<{
  form: Record<string, any>;
  loading: boolean;
  error: Error | null;
  submitForm: () => Promise<void>;
  allowReset?: boolean;
  onCancel?: () => void;
}>();

const emit = defineEmits<{
  (e: 'update:form', value: Record<string, any>): void;
  (e: 'reset'): void;
}>();

const saving = ref(false);
const saveSuccess = ref(false);

let initialFormState = ref({});
const initialFormCaptured = ref(false);

watch(
  () => props.form,
  (newForm) => {
    if (!props.loading && newForm && !initialFormCaptured.value) {
      initialFormState.value = JSON.parse(JSON.stringify(toRaw(newForm)));
      initialFormCaptured.value = true;
    }
  },
  { immediate: true, deep: true }
);

async function onSubmit() {
  saving.value = true;
  saveSuccess.value = false;
  try {
    await props.submitForm();
    initialFormState.value = JSON.parse(JSON.stringify(toRaw(props.form)));
    saveSuccess.value = true;
    setTimeout(() => (saveSuccess.value = false), 2000);
  } catch (err) {
    console.error('Save failed:', err);
  } finally {
    saving.value = false;
  }
}

function resetForm() {
  const cloned = JSON.parse(JSON.stringify(initialFormState.value));
  emit('update:form', cloned);
  emit('reset');
}
</script>

<template>
  <form @submit.prevent="onSubmit" class="settings-form">
    <div v-if="loading">Loading…</div>

    <div v-else>
      <template v-if="form">
        <slot name="form" />
      </template>

      <div class="actions">
        <!-- Default buttons -->
        <template v-if="!$slots.footer">
          <button type="submit" :disabled="saving">Save</button>

          <button v-if="allowReset" type="button" @click="resetForm" :disabled="saving">
            Reset
          </button>

          <button v-if="onCancel" type="button" @click="onCancel" :disabled="saving">Cancel</button>

          <span v-if="saveSuccess" class="success-msg">Saved!</span>
        </template>

        <!-- Custom footer slot (replaces default buttons) -->
        <slot name="footer" :saving="saving" :saveSuccess="saveSuccess" />
      </div>

      <div v-if="error" class="error">
        {{ error.message }}
      </div>

      <slot name="after" />
    </div>
  </form>
</template>

<style scoped>
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.actions {
  padding-top: 1rem;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  gap: 1rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.success-msg {
  color: green;
  font-size: 0.9rem;
}

.error {
  color: red;
  font-size: 0.9rem;
}
</style>
