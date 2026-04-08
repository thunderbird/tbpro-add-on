<script setup lang="ts">
import DownloadIcon from './DownloadIcon.vue';
import ProButton from './ProButton.vue';

const handleDownloadTB = () => {
  window.open(
    'https://www.thunderbird.net/thunderbird/all/?utm_campaign=main&utm_medium=tb_pro&utm_source=thundermail_dashboard&utm_content=banner_top',
    '_blank',
    'noopener,noreferrer'
  );
};
</script>
<template>
  <div class="bg">
    <p class="text">
      To use Send, you must enable it in Thunderbird Desktop. Download the app
      and sign in to Thunderbird Pro from the Thunderbird menu.
    </p>
    <div class="buttonwrapper">
      <ProButton class="button" type="secondary" @click="handleDownloadTB">
        <DownloadIcon />
        Download</ProButton
      >
    </div>
    <img
      class="tbdashboard"
      src="./thundermail-dashboard.png"
      alt="Thunderbird desktop app"
    />
  </div>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.bg {
  max-width: 350px;
  position: relative;
  padding: 24px 24px 0.3px;
  border-radius: 24px;
  box-shadow: 4px 4px 16px 0 rgba(0, 0, 0, 0.04);
  border: solid 1px var(--surface-border);
  background-image:
    linear-gradient(
      315deg,
      rgba(88, 202, 255, 0.15) 0%,
      rgba(88, 201, 255, 0) 60%
    ),
    linear-gradient(to bottom, #feffff, #feffff);
}
.text {
  align-self: stretch;
  flex-grow: 0;
  font-family: Inter;
  font-size: 14px;
  color: var(--text-icon-secondary);
}
.buttonwrapper {
  padding: 2rem 0;
}
.tbdashboard {
  position: absolute;
  width: 165.1px;
  height: 81.7px;
  bottom: 0;
  right: 25%;
  transform: translateX(50%);
}
</style>
