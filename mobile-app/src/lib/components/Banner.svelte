<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { banner } from '../stores/banner.store.js';
  import { CircleCheckBig } from 'lucide-svelte';
</script>

{#if $banner.visible}
  <div
    class="safe-area-top pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4"
    transition:fly={{ y: -24, duration: 280, easing: cubicOut }}
  >
    <div
      class="pointer-events-auto flex items-center gap-2.5 rounded-full bg-ink/95 py-2.5 pl-3 pr-4 text-white shadow-nav backdrop-blur-sm"
    >
      <CircleCheckBig size={20} class="shrink-0 text-primary" />
      <span class="text-[13px] font-semibold">{$banner.message}</span>
    </div>
  </div>
{/if}
