<script setup lang="ts"></script>

<template>
  <main class="flex flex-col gap-2">
    <h1>Your file is ready to download securely</h1>
    <slot></slot>
  </main>
</template>

<style lang="css" scoped>
h1 {
  font-size: 24px;
  font-weight: 500;
  color: var(--colour-primary-default);
}
h3 {
  font-size: 20px;
}
.prompt {
  color: var(--colour-ti-muted);
  font-size: 11px;
}
.critical {
  color: var(--colour-ti-critical);
}
input {
  height: 44px;
  align-self: stretch;
  flex-grow: 0;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  box-shadow: inset 2px 2px 4px 0 rgba(0, 0, 0, 0.05);
  border: solid 1px var(--colour-surface-border);
  background-color: var(--colour-surface-base);
}
.passwordText {
  font-size: 14px;
  font-weight: 600;
  color: var(--colour-ti-secondary);
}
main {
  padding: 2rem;
}
</style>
