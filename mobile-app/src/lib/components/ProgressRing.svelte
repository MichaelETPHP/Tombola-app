<script lang="ts">
  import { dimensions } from '../theme/tokens.js';

  /** 0–100 */
  export let value = 0;
  export let size = 56;
  export let thickness: number = dimensions.progressRingThickness;
  export let color = '#00D3A0';
  export let trackColor = '#D9DCE3';
  export let label = '';

  $: clamped = Math.max(0, Math.min(100, value));
  $: radius = (size - thickness) / 2;
  $: circumference = 2 * Math.PI * radius;
  $: offset = circumference - (clamped / 100) * circumference;
</script>

<div class="relative inline-flex items-center justify-center" style="width: {size}px; height: {size}px;">
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
      class="transition-[stroke-dashoffset] duration-[600ms] ease-out"
    />
  </svg>
  {#if label || $$slots.default}
    <span class="absolute text-[11px] font-bold text-ink">
      <slot>{label}</slot>
    </span>
  {/if}
</div>
