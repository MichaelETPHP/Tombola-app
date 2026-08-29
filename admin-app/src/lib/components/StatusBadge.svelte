<script lang="ts">
  import { statusColors } from '../theme/tokens.js';

  export let status: keyof typeof statusColors | string;

  $: palette = status in statusColors ? statusColors[status as keyof typeof statusColors] : null;
</script>

<span
  class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold capitalize"
  style={palette
    ? `color: ${palette.fg}; background: ${palette.bg};`
    : 'color: var(--color-muted); background: var(--color-border);'}
>
  <span class="h-1.5 w-1.5 rounded-full" style={palette ? `background: ${palette.fg};` : 'background: var(--color-muted);'}></span>
  {status.replace(/_/g, ' ')}
</span>
