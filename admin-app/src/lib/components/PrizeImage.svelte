<script lang="ts">
  import type { ComponentType } from 'svelte';
  import { ImagePlus } from 'lucide-svelte';
  import { productionImageUrl, resolveImageUrl } from '../utils/imageUrl.js';

  export let src: string | null = null;
  export let alt = '';
  export let icon: ComponentType = ImagePlus;
  export let iconSize = 16;
  // Always-visible thumbnails (a short list near the top of the page)
  // should start fetching immediately rather than waiting on the
  // lazy-load viewport check — see raffles list usage.
  export let eager = false;
  let className = '';
  export { className as class };

  // 'local' -> 'production' -> 'failed'. Most images only exist on
  // whichever server actually processed the upload (see api/lib/uploads.ts
  // — each environment has its own disk/volume, not shared storage), so a
  // local-dev 404 tries the known production origin once before giving up
  // to the fallback icon. The production hop alone can take a couple of
  // seconds over TLS from a modest VPS, so `loaded` drives a pulse-then-
  // fade rather than leaving a dead blank box for that whole window.
  let stage: 'local' | 'production' | 'failed' = 'local';
  let previousSrc: string | null = null;
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

<div class="overflow-hidden {className} {pending ? 'animate-pulse bg-bg' : ''}">
  {#if resolvedSrc && stage !== 'failed'}
    <img
      src={resolvedSrc}
      {alt}
      loading={eager ? 'eager' : 'lazy'}
      class="h-full w-full object-cover transition-opacity duration-200 {loaded ? 'opacity-100' : 'opacity-0'}"
      on:error={handleError}
      on:load={() => (loaded = true)}
    />
  {:else}
    <div class="flex h-full w-full items-center justify-center text-faint">
      <svelte:component this={icon} size={iconSize} />
    </div>
  {/if}
</div>
