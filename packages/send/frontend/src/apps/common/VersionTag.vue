<script setup lang="ts">
// Renders the version of the build this component is compiled into, injected at
// build time via the __APP_VERSION__ define. In the add-on build (where this is
// used, on the management page and popup) that's the add-on version — making it
// easy to tell which add-on version is running.
const version = __APP_VERSION__;
</script>

<template>
  <span class="addon-version-tag" data-testid="addon-version">
    v{{ version }}
  </span>
</template>

<style scoped>
.addon-version-tag {
  display: inline-block;
  font-family: Inter, sans-serif;
  font-size: 0.6875rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  /* Inherit the surrounding text color (dark footer vs. light pages) and dim
     it so the tag is present but unobtrusive. */
  color: currentColor;
  opacity: 0.6;
}
</style>
