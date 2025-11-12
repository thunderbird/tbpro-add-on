<script setup lang="ts">
import { StandardFooter } from '@thunderbirdops/services-ui';
import TBProIcon from '../elements/TBProIcon.vue';
</script>

<template>
  <header>
    <nav class="header-nav">
      <div class="header-logo">
        <a href="https://tb.pro/" class="logo-link">
          <TBProIcon />
        </a>
      </div>
    </nav>
  </header>

  <div class="content">
    <slot></slot>
  </div>

  <StandardFooter
    contribute-to-this-site-url="https://github.com/thunderbird/tbpro-add-on"
  />
</template>

<style lang="css" scoped>
header {
  height: 60px;
  display: flex;
  align-items: center;
  background: linear-gradient(138deg, #1b2128 34%, #171b24 55%);
  padding: 0 2rem;
}

.header-nav {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-logo {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.logo-icon {
  font-size: 1.5rem;
}

.logo-link {
  text-decoration: none;
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.logo-text {
  color: #ffffff;
  font-weight: 400;
  font-size: 1.25rem;
}

.logo-pro {
  color: #5d7eff;
  font-weight: 700;
  font-size: 1.25rem;
}

.header-links {
  display: flex;
  gap: 2.5rem;
  align-items: center;
}

.header-links a {
  text-decoration: none;
  color: #ffffff;
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.5px;
  transition: color 0.2s;
}

.header-links a:hover {
  color: #5d7eff;
}

.header-auth {
  display: flex;
  align-items: center;
}

.sign-in-btn {
  background: transparent;
  border: 2px solid #5d7eff;
  color: #ffffff;
  padding: 0.5rem 1.5rem;
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.5px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.sign-in-btn:hover {
  background: #5d7eff;
  color: #ffffff;
}

.content {
  min-height: calc(100vh - 250px - 60px);
}
</style>
