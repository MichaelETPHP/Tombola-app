<script lang="ts">
  import PrizeArt from './PrizeArt.svelte';
  import { productionImageUrl, resolveImageUrl } from '../utils/imageUrl.js';

  export let src: string | null = null;
  export let title: string;
  export let prizeName: string;
  export let size: 'sm' | 'lg' = 'sm';
  export let eager = false;

  // 'local' -> 'production' -> 'failed'. Most images only exist on
  // whichever server actually processed the upload (see imageUrl.ts), so
  // a local-dev 404 tries the known production origin once before giving
  // up to the illustration.
  let stage: 'local' | 'production' | 'failed' = 'local';
  let previousSrc: string | null = null;

  $: if (src !== previousSrc) {
    previousSrc = src;
    stage = 'local';
  }
  $: resolvedSrc = stage === 'production' ? productionImageUrl(src) : resolveImageUrl(src);

  function handleError() {
    const fallback = productionImageUrl(src);
    stage = stage === 'local' && fallback && fallback !== resolveImageUrl(src) ? 'production' : 'failed';
  }
</script>

<div class="h-full w-full overflow-hidden bg-[#d9f5e9]">
  {#if resolvedSrc && stage !== 'failed'}
    <img
      src={resolvedSrc}
      alt={prizeName}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'low'}
      decoding="async"
      class="h-full w-full object-cover"
      on:error={handleError}
    />
  {:else}
    <PrizeArt {title} {prizeName} {size} />
  {/if}
</div>
