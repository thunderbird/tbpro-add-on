<script setup lang="ts">
import { ref } from 'vue';
import RegisterForm from '../send/RegisterForm.vue';
import LoginForm from './LoginForm.vue';

const { onSuccess } = defineProps<{
  onSuccess: () => Promise<void>;
}>();

const isLoggingIn = ref(true);

function toggleForm() {
  isLoggingIn.value = !isLoggingIn.value;
}
</script>

<template>
  <div>
    <div v-if="isLoggingIn">
      <LoginForm :on-success="onSuccess" />
      <p class="mt-2 text-blue-500">
        Or
        <button data-testid="register-button" @click.prevent="toggleForm">
          register
        </button>
      </p>
    </div>
    <div v-else>
      <RegisterForm />
    </div>
  </div>
</template>
