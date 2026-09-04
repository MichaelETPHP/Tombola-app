<script lang="ts">
  import PrizeArt from './PrizeArt.svelte';
  import { productionImageUrl, resolveImageUrl } from '../utils/imageUrl.js';

  export let src: string | null = null;
  export let title: string;
  export let prizeName: string;
  export let size: 'sm' | 'lg' = 'sm';
  export let fit: 'cover' | 'contain' = 'cover';
  export let eager = false;

  // 'local' -> 'production' -> 'failed'. Most images only exist on
  // whichever server actually processed the upload (see imageUrl.ts), so
  // a local-dev 404 tries the known production origin once before giving
  // up to the illustration.
  let stage: 'local' | 'production' | 'failed' = 'local';
  let previousSrc: string | null = null;
  // The production hop alone can take a couple of seconds over TLS from a
  // modest VPS — this drives a pulse-then-fade instead of a dead blank box
  // for that whole window.
  let loaded = false;

  $: if (src !== previousSrc) {
    previousSrc = src;
    stage = 'local';
    loaded = false;
  }
  $: resolvedSrc = stage === 'production' ? productionImageUrl(src) : resolveImageUrl(src);
  $: pending = Boolean(resolvedSrc) && stage !== 'failed' && !loaded;

  function handleError() {
    const fallback = productionImageUrl(src);
    stage = stage === 'local' && fallback && fallback !== resolveImageUrl(src) ? 'production' : 'failed';
  }
</script>

<div class="h-full w-full overflow-hidden bg-[#d9f5e9] {pending ? 'animate-pulse' : ''}">
  {#if resolvedSrc && stage !== 'failed'}
    <img
      src={resolvedSrc}
      alt={prizeName}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'low'}
      decoding="async"
      class="h-full w-full transition-opacity duration-200 {fit === 'contain' ? 'object-contain' : 'object-cover'} {loaded ? 'opacity-100' : 'opacity-0'}"
      on:error={handleError}
      on:load={() => (loaded = true)}
    />
  {:else}
    <PrizeArt {title} {prizeName} {size} />
  {/if}
</div>
