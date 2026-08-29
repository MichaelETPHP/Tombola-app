<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { showExitHint } from '../stores/backExit.store.js';
</script>

{#if $showExitHint}
  <div
    class="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-6"
    transition:fly={{ y: 12, duration: 220, easing: cubicOut }}
  >
    <div class="rounded-full bg-ink/90 px-4 py-2.5 text-[13px] font-medium text-white shadow-nav backdrop-blur-sm">
      Press back again to exit
    </div>
  </div>
{/if}
