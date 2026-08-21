<script lang="ts">
  import ProgressRing from './ProgressRing.svelte';
  import { statCardAccents } from '../theme/tokens.js';

  export let label: string;
  export let value: string | number = '';
  export let subLabel = '';
  /** Which accent palette from theme tokens to apply. */
  export let accent: keyof typeof statCardAccents = 'tickets';
  /** Optional 0–100 progress to render as a ring instead of a plain number. */
  export let progress: number | null = null;

  $: palette = statCardAccents[accent];
</script>

<div class="stat-card">
  <div class="icon" style="background: {palette.iconBg}; color: {palette.iconColor};">
    <slot name="icon">●</slot>
  </div>

  {#if progress !== null}
    <ProgressRing
      value={progress}
      size={48}
      color={palette.accentColor}
      trackColor={'trackColor' in palette ? palette.trackColor : '#D9DCE3'}
      label="{Math.round(progress)}%"
    />
  {:else}
    <span class="value">{value}</span>
  {/if}

  <span class="label">{label}</span>
  {#if subLabel}
    <span class="sub-label">{subLabel}</span>
  {/if}
</div>

<style>
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    background: var(--color-card-bg);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-16);
  }

  .icon {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .value {
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: var(--color-text-primary);
  }

  .label {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .sub-label {
    font-size: 12px;
    font-weight: 400;
    color: var(--color-text-secondary);
  }
</style>
