<template>
  <svg
    width="97"
    height="96"
    viewBox="0 0 97 96"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g filter="url(#sendicon_filter)">
      <mask
        id="sendicon_mask"
        style="mask-type: luminance"
        maskUnits="userSpaceOnUse"
        x="16"
        y="12"
        width="65"
        height="64"
      >
        <path
          d="M67.9 12H28.596C21.64 12 16 17.596 16 24.5v39C16 70.404 21.64 76 28.597 76h39.302c6.957 0 12.597-5.596 12.597-12.5v-39c0-6.904-5.64-12.5-12.597-12.5z"
          fill="#fff"
        />
      </mask>
      <g mask="url(#sendicon_mask)">
        <path
          d="M67.9 12H28.596C21.64 12 16 17.596 16 24.5v39C16 70.404 21.64 76 28.597 76h39.302c6.957 0 12.597-5.596 12.597-12.5v-39c0-6.904-5.64-12.5-12.597-12.5z"
          fill="#fff"
        />
        <path d="M80.496 12H16v64h64.496V12z" fill="url(#sendicon_gradient)" />
        <path
          d="M48.248 32v12m0-12l-4 4m4-4l4 4"
          stroke="#1373D9"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M38 44h20.496c2.209 0 4-1.791 4-4V32"
          stroke="#1373D9"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M32 56h32.496v8c0 2.209-1.791 4-4 4H36c-2.209 0-4-1.791-4-4v-8z"
          fill="#1373D9"
          opacity="0.2"
        />
        <path
          d="M32 52h32.496"
          stroke="#1373D9"
          stroke-width="2"
          stroke-linecap="round"
        />
      </g>
    </g>
    <defs>
      <linearGradient
        id="sendicon_gradient"
        x1="48.248"
        y1="7.75"
        x2="56.297"
        y2="168.848"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#fff" />
        <stop offset=".9" stop-color="#BEE1FE" />
      </linearGradient>
      <filter
        id="sendicon_filter"
        x="0"
        y="0"
        width="96.496"
        height="96"
        filterUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB"
      >
        <feFlood flood-opacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feMorphology
          radius="10"
          operator="dilate"
          in="SourceAlpha"
          result="effect1_dropShadow"
        />
        <feOffset dy="4" />
        <feGaussianBlur stdDeviation="3" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix
          values="0 0 0 0 0.0980392 0 0 0 0 0.317647 0 0 0 0 0.560784 0 0 0 0.12 0"
        />
        <feBlend in2="BackgroundImageFix" result="effect1_dropShadow" />
        <feBlend in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
      </filter>
    </defs>
  </svg>
</template>
