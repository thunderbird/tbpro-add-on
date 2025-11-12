<script setup lang="ts"></script>

<template>
  <section class="mx-4 mb-4" data-testid="feedback-box">
    <a href="https://support.tb.pro">
      <p class="text">Need help? Visit Support</p>
    </a>
  </section>
</template>

<style scoped>
.text {
  font-size: 9px;
  font-weight: 700;
}
.link-container {
  display: flex;
  gap: 1rem;
}
.link-container a {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  color: var(--primary-default);
  text-decoration: none;
}
section {
  font-size: 11px;
  font-weight: normal;
  font-stretch: normal;
  font-style: normal;
  line-height: normal;
  letter-spacing: normal;
  text-align: left;
  color: var(--text-icon-secondary);
}
</style>
