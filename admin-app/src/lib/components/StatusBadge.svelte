<script lang="ts">
  import { statusColors } from '../theme/tokens.js';

  export let status: keyof typeof statusColors | string;

  $: palette = status in statusColors ? statusColors[status as keyof typeof statusColors] : null;
</script>

<span
  class="badge"
  style={palette
    ? `color: ${palette.fg}; background: ${palette.bg};`
    : 'color: var(--color-text-secondary); background: var(--color-border);'}
>
  {status.replace(/_/g, ' ')}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--space-12);
    border-radius: var(--radius-pill);
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
    white-space: nowrap;
  }
</style>
