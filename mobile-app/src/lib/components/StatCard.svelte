<script lang="ts">
  import ProgressRing from './ProgressRing.svelte';
  import { statCardAccents } from '../theme/tokens.js';

  export let label: string;
  export let value: string | number = '';
  export let subLabel = '';
  /** Which accent palette from theme tokens to apply. */
  export let accent: keyof typeof statCardAccents = 'tickets';
  /** Optional 0–100 progress — renders a small ring alongside the value, bottom-right. */
  export let progress: number | null = null;
  /** Optional full-width CTA button below the value (Active Tickets card only). */
  export let ctaLabel = '';
  export let ctaHref = '';

  $: palette = statCardAccents[accent];
</script>

<div class="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card">
  <div class="flex items-center gap-2">
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style="background: {palette.iconBg}; color: {palette.iconColor};"
    >
      <slot name="icon" />
    </div>
    <span class="text-sm font-semibold text-ink">{label}</span>
  </div>

  <div class="flex items-end justify-between gap-2">
    <div class="flex min-w-0 flex-col gap-0.5">
      <span class="whitespace-nowrap text-3xl font-extrabold tracking-tight text-ink">{value}</span>
      {#if subLabel}
        <span class="text-xs text-muted">{subLabel}</span>
      {/if}
    </div>

    {#if progress !== null}
      <ProgressRing
        value={progress}
        size={40}
        thickness={5}
        color={palette.accentColor}
        trackColor={'trackColor' in palette ? palette.trackColor : '#D9DCE3'}
        label="{Math.round(progress)}%"
      />
    {/if}
  </div>

  {#if ctaLabel}
    <a
      href={ctaHref}
      class="pressable flex h-11 w-full items-center justify-center gap-2 rounded-button bg-gradient-to-br from-coral-start to-coral-end text-sm font-bold text-white shadow-[0_6px_16px_rgba(255,107,107,0.35)]"
    >
      <slot name="cta-icon" />
      {ctaLabel}
    </a>
  {/if}
</div>
