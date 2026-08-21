<script lang="ts">
  import { dimensions } from '../theme/tokens.js';

  /** 0–100 */
  export let value = 0;
  export let size = 56;
  export let thickness = dimensions.progressRingThickness;
  export let color = '#00D3A0';
  export let trackColor = '#D9DCE3';
  export let label = '';

  $: clamped = Math.max(0, Math.min(100, value));
  $: radius = (size - thickness) / 2;
  $: circumference = 2 * Math.PI * radius;
  $: offset = circumference - (clamped / 100) * circumference;
</script>

<div class="ring" style="width: {size}px; height: {size}px;">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke={trackColor}
      stroke-width={thickness}
    />
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
      class="progress"
    />
  </svg>
  {#if label || $$slots.default}
    <span class="ring-label">
      <slot>{label}</slot>
    </span>
  {/if}
</div>

<style>
  .ring {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .progress {
    transition: stroke-dashoffset 0.4s ease;
  }

  .ring-label {
    position: absolute;
    font-size: 11px;
    font-weight: 700;
    color: var(--color-text-primary);
  }
</style>
