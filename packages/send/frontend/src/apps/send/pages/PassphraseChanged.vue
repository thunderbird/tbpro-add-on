<script setup lang="ts">
import KeysTemplate from '../views/KeysTemplate.vue';
import SupportBox from '../views/SupportBox.vue';
</script>

<template>
  <section class="content-layout">
    <div class="row">
      <div>
        <KeysTemplate>
          <h2 class="section-title text-red-700">Warning</h2>
          <p class="description">
            Your keys are incorrect. This may happen if you reset your
            passphrase on a different device. Please log out and log back in to
            restore access to your keys.
          </p>
        </KeysTemplate>
      </div>

      <div>
        <SupportBox />
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped>
* {
  padding-left: 1rem;
  padding-right: 1rem;
  margin-top: 1rem;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}
</style>
