<script setup lang="ts">
/**
 * AuthLoader — animated Send-logo loading indicator.
 *
 * The logo is "drawn" via a stroke-dash trail that fills in the body, then a
 * circular reveal sweeps the arrowhead. Each completed pass alternates the
 * fill colour between brand blue and white. The accompanying message animates
 * a trailing ellipsis purely in CSS.
 *
 * The draw animation manipulates SVG attributes per frame via
 * requestAnimationFrame, so the affected nodes are accessed through template
 * refs rather than reactive bindings (re-rendering ~60 times a second would be
 * wasteful). Element ids are generated with useId() to keep the clip-path and
 * mask references unique even if several loaders mount at once.
 */
import { onBeforeUnmount, onMounted, useId, useTemplateRef } from 'vue';

withDefaults(defineProps<{ message?: string }>(), {
  message: 'Completing authentication',
});

const BLUE = '#1373D9';
const WHITE = '#FEFFFF';

const logoClipId = useId();
const arrowHeadClipId = useId();
const bodyMaskId = useId();
const arrowHeadMaskId = useId();

const bodyPath = useTemplateRef<SVGPathElement>('bodyPath');
const trailPath = useTemplateRef<SVGPathElement>('trailPath');
const headPath = useTemplateRef<SVGPathElement>('headPath');
const bodyFill = useTemplateRef<SVGRectElement>('bodyFill');
const arrowHeadFill = useTemplateRef<SVGRectElement>('arrowHeadFill');
const revealCircle = useTemplateRef<SVGCircleElement>('revealCircle');

let rafId = 0;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

onMounted(() => {
  const body = bodyPath.value;
  const trail = trailPath.value;
  const head = headPath.value;
  const bodyRect = bodyFill.value;
  const arrowRect = arrowHeadFill.value;
  const reveal = revealCircle.value;

  if (!body || !trail || !head || !bodyRect || !arrowRect || !reveal) return;

  const length = body.getTotalLength();

  // Length (in path units) of the glowing leading segments and the point at
  // which the body finishes drawing and the arrowhead reveal begins.
  const HEAD_LENGTH = 7;
  const TRAIL_LENGTH = 19;
  const ARROW_START = 0.8;

  const setSegment = (path: SVGPathElement, start: number, size: number) => {
    path.style.strokeDasharray = `${size} ${length}`;
    path.style.strokeDashoffset = `${-start}`;
  };

  let t = 0;
  let bluePass = true;

  const render = (progress: number) => {
    const color = bluePass ? BLUE : WHITE;

    bodyRect.setAttribute('fill', color);
    arrowRect.setAttribute('fill', color);
    trail.style.stroke = color;
    head.style.stroke = color;
    trail.style.color = color;
    head.style.color = color;

    const bodyProgress = Math.min(progress / ARROW_START, 1);
    const bodyCurrent = length * bodyProgress;

    body.style.strokeDasharray = `${bodyCurrent} ${length}`;
    body.style.strokeDashoffset = '0';

    setSegment(
      trail,
      Math.max(0, bodyCurrent - TRAIL_LENGTH),
      Math.min(TRAIL_LENGTH, bodyCurrent)
    );
    setSegment(
      head,
      Math.max(0, bodyCurrent - HEAD_LENGTH),
      Math.min(HEAD_LENGTH, bodyCurrent)
    );

    const fadeIn = Math.min(progress / 0.14, 1);
    const fadeOut =
      progress > ARROW_START
        ? Math.max(0, 1 - (progress - ARROW_START) / 0.08)
        : 1;
    const opacity = Math.min(fadeIn, fadeOut);

    trail.style.opacity = `${opacity * 0.22}`;
    head.style.opacity = `${opacity * 0.62}`;

    const arrowProgress =
      progress < ARROW_START ? 0 : (progress - ARROW_START) / (1 - ARROW_START);
    const eased = easeOutCubic(Math.max(0, Math.min(1, arrowProgress)));

    const baseY = 28.7;
    const startRadius = 0.2;
    const maxRadius = 17.2;

    reveal.setAttribute('cx', '32');
    reveal.setAttribute('cy', `${baseY + startRadius}`);
    reveal.setAttribute(
      'r',
      `${startRadius + (maxRadius - startRadius) * eased}`
    );
  };

  const tick = () => {
    t += 0.0026;
    if (t >= 1) {
      t = 0;
      bluePass = !bluePass;
    }
    render(t);
    rafId = requestAnimationFrame(tick);
  };

  tick();
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<template>
  <div
    class="auth-loader"
    role="status"
    aria-live="polite"
    :aria-label="message"
  >
    <p class="auth-loader__text">
      {{ message }}<span class="dot one">.</span><span class="dot two">.</span
      ><span class="dot three">.</span>
    </p>

    <svg class="auth-loader__logo" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath :id="logoClipId">
          <path
            d="M32.6484 1.00879C46.229 1.36164 56.9999 12.7666 57 26.6152V48.9346C57 56.5038 51.1038 62.8002 43.5947 62.9951L43.2363 63C35.8409 63 29.2103 56.9828 29.0049 49.3018L29 48.9346L29 28.7275H22.1582C21.0933 28.7275 20.5598 27.4406 21.3125 26.6875L30.7324 17.2676C31.4326 16.5678 32.5674 16.5678 33.2676 17.2676L42.6875 26.6875C43.4402 27.4406 42.9067 28.7275 41.8418 28.7275L35 28.7275L35 48.9346L35.0107 49.3418C35.241 53.5289 38.9961 57 43.2363 57L43.6289 56.9893C47.6652 56.7776 51 53.3257 51 48.9346V26.6152C50.9999 15.8741 42.6823 7.27324 32.4873 7.00684L32 7C21.5841 7 13.0001 15.7035 13 26.6152L13 33H7L7 26.6152C7.00008 12.5469 18.1154 1 32 1L32.6484 1.00879Z"
          />
        </clipPath>

        <clipPath :id="arrowHeadClipId">
          <path
            d="M22.1582 28.7275C21.0933 28.7275 20.5598 27.4406 21.3125 26.6875L30.7324 17.2676C31.4326 16.5678 32.5674 16.5678 33.2676 17.2676L42.6875 26.6875C43.4402 27.4406 42.9067 28.7275 41.8418 28.7275H22.1582Z"
          />
        </clipPath>

        <mask :id="bodyMaskId">
          <rect width="64" height="64" fill="black" />
          <path
            ref="bodyPath"
            class="mask-path"
            d="M7 33 L7 26.6 C7 12.5 18.1 1 32 1 C46 1 57 12.7 57 26.6 L57 48.9 C57 56.5 51.1 63 43.2 63 C35.8 63 29 57 29 48.9 L29 28.7 L32 28.7"
          />
        </mask>

        <mask :id="arrowHeadMaskId">
          <rect width="64" height="64" fill="black" />
          <circle ref="revealCircle" cx="32" cy="28.9" r="0" fill="white" />
        </mask>
      </defs>

      <path opacity="0.2" d="M0 36L64 36" stroke="#E4E4E7" stroke-width="6" />

      <path
        d="M32.6484 1.00879C46.229 1.36164 56.9999 12.7666 57 26.6152V48.9346C57 56.5038 51.1038 62.8002 43.5947 62.9951L43.2363 63C35.8409 63 29.2103 56.9828 29.0049 49.3018L29 48.9346L29 28.7275H22.1582C21.0933 28.7275 20.5598 27.4406 21.3125 26.6875L30.7324 17.2676C31.4326 16.5678 32.5674 16.5678 33.2676 17.2676L42.6875 26.6875C43.4402 27.4406 42.9067 28.7275 41.8418 28.7275L35 28.7275L35 48.9346L35.0107 49.3418C35.241 53.5289 38.9961 57 43.2363 57L43.6289 56.9893C47.6652 56.7776 51 53.3257 51 48.9346V26.6152C51 15.8741 42.6823 7.27324 32.4873 7.00684L32 7C21.5841 7 13.0001 15.7035 13 26.6152L13 33H7L7 26.6152C7.00008 12.5469 18.1154 1 32 1L32.6484 1.00879Z"
        fill="#E4E4E7"
      />

      <g :clip-path="`url(#${logoClipId})`" :mask="`url(#${bodyMaskId})`">
        <rect ref="bodyFill" width="64" height="64" :fill="BLUE" />
      </g>

      <g
        :clip-path="`url(#${arrowHeadClipId})`"
        :mask="`url(#${arrowHeadMaskId})`"
      >
        <rect ref="arrowHeadFill" width="64" height="64" :fill="BLUE" />
      </g>

      <g :clip-path="`url(#${logoClipId})`">
        <path
          ref="trailPath"
          class="trail-path"
          d="M7 33 L7 26.6 C7 12.5 18.1 1 32 1 C46 1 57 12.7 57 26.6 L57 48.9 C57 56.5 51.1 63 43.2 63 C35.8 63 29 57 29 48.9 L29 28.7 L32 28.7"
        />
        <path
          ref="headPath"
          class="head-path"
          d="M7 33 L7 26.6 C7 12.5 18.1 1 32 1 C46 1 57 12.7 57 26.6 L57 48.9 C57 56.5 51.1 63 43.2 63 C35.8 63 29 57 29 48.9 L29 28.7 L32 28.7"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.auth-loader {
  text-align: center;
}

.auth-loader__text {
  margin: 0 0 32px;
  color: var(--text-icon-base);
  font-size: 24px;
  font-weight: 400;
  line-height: 1.35;
}

.auth-loader__logo {
  display: block;
  width: 64px;
  height: 64px;
  margin: 0 auto;
  overflow: visible;
}

.dot {
  opacity: 0;
}
.one {
  animation: dot-one 2.1s infinite;
}
.two {
  animation: dot-two 2.1s infinite;
}
.three {
  animation: dot-three 2.1s infinite;
}

@keyframes dot-one {
  0% {
    opacity: 0;
  }
  25%,
  100% {
    opacity: 1;
  }
}

@keyframes dot-two {
  0%,
  25% {
    opacity: 0;
  }
  50%,
  100% {
    opacity: 1;
  }
}

@keyframes dot-three {
  0%,
  50% {
    opacity: 0;
  }
  75%,
  100% {
    opacity: 1;
  }
}

.mask-path,
.trail-path,
.head-path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mask-path {
  stroke: white;
  stroke-width: 13;
}

.trail-path {
  stroke-width: 13;
  opacity: 0.22;
  filter: drop-shadow(0 0 3px currentColor);
}

.head-path {
  stroke-width: 13;
  opacity: 0.62;
  filter: drop-shadow(0 0 3px currentColor) drop-shadow(0 0 5px currentColor);
}

@media (prefers-reduced-motion: reduce) {
  .one,
  .two,
  .three {
    animation: none;
    opacity: 1;
  }
}
</style>
