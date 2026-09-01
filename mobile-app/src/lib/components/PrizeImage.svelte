<script lang="ts">
  import PrizeArt from './PrizeArt.svelte';
  import { resolveImageUrl } from '../utils/imageUrl.js';

  export let src: string | null = null;
  export let title: string;
  export let prizeName: string;
  export let size: 'sm' | 'lg' = 'sm';
  export let eager = false;

  let failed = false;
  let previousSrc: string | null = null;

  $: if (src !== previousSrc) {
    previousSrc = src;
    failed = false;
  }
  $: resolvedSrc = resolveImageUrl(src);
</script>

<div class="h-full w-full overflow-hidden bg-[#d9f5e9]">
  {#if resolvedSrc && !failed}
    <img
      src={resolvedSrc}
      alt={prizeName}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'low'}
      decoding="async"
      class="h-full w-full object-cover"
      on:error={() => (failed = true)}
    />
  {:else}
    <PrizeArt {title} {prizeName} {size} />
  {/if}
</div>
