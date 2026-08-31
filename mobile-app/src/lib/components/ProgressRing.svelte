<script lang="ts">
  import { dimensions } from '../theme/tokens.js';

  /** 0–100 */
  export let value = 0;
  export let size = 56;
  export let thickness: number = dimensions.progressRingThickness;
  export let color = '#00D3A0';
  export let trackColor = '#D9DCE3';
  export let label = '';
  /** When true, briefly pulses the ring glow whenever value changes */
  export let animate = false;

  $: clamped = Math.max(0, Math.min(100, value));
  $: radius = (size - thickness) / 2;
  $: circumference = 2 * Math.PI * radius;
  $: offset = circumference - (clamped / 100) * circumference;

  // Pulse on value change
  let pulsing = false;
  let prevValue = value;
  $: if (animate && value !== prevValue) {
    prevValue = value;
    pulsing = false;
    // give the DOM a frame to reset the class, then re-add it
    requestAnimationFrame(() => {
      pulsing = true;
    });
  }
</script>

<div class="relative inline-flex items-center justify-center" style="width: {size}px; height: {size}px;">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <!-- Track -->
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke={trackColor}
      stroke-width={thickness}
    />
    <!-- Progress arc -->
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke={color}
      stroke-width={thickness}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={offset}
      transform="rotate(-90 {size / 2} {size / 2})"
      class="progress-arc transition-[stroke-dashoffset] duration-[500ms] ease-out"
    />
    <!-- Animated glow pulse ring (only when animate=true and value changes) -->
    {#if animate && pulsing}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        stroke-width={thickness + 4}
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={offset}
        transform="rotate(-90 {size / 2} {size / 2})"
        class="glow-pulse"
        on:animationend={() => (pulsing = false)}
      />
    {/if}
  </svg>
  {#if label || $$slots.default}
    <span class="absolute text-[11px] font-bold text-ink">
      <slot>{label}</slot>
    </span>
  {/if}
</div>

<style>
  .glow-pulse {
    opacity: 0.55;
    animation: ring-glow 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    pointer-events: none;
  }

  @keyframes ring-glow {
    0%   { opacity: 0.55; stroke-width: 12px; }
    60%  { opacity: 0.20; stroke-width: 6px;  }
    100% { opacity: 0;    stroke-width: 4px;  }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow-pulse {
      animation: none;
      opacity: 0;
    }
  }
</style>

