<script lang="ts">
  import type { ComponentType } from 'svelte';

  export let items: { icon: ComponentType; label: string; href: string }[];
</script>

<div class="grid grid-cols-4 gap-x-[10px] gap-y-3">
  {#each items as item (item.label)}
    <a href={item.href} class="tappable flex flex-col items-center gap-2 rounded-action bg-card px-1 py-3 shadow-card-light">
      <span class="flex h-11 w-11 items-center justify-center rounded-full bg-action-bg text-action-icon">
        <svelte:component this={item.icon} size={20} />
      </span>
      <span class="text-center text-xs font-medium leading-tight text-ink">{item.label}</span>
    </a>
  {/each}
</div>
