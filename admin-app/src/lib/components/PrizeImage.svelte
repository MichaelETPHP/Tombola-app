<script lang="ts">
  import type { ComponentType } from 'svelte';
  import { ImagePlus } from 'lucide-svelte';
  import { productionImageUrl, resolveImageUrl } from '../utils/imageUrl.js';

  export let src: string | null = null;
  export let alt = '';
  export let icon: ComponentType = ImagePlus;
  export let iconSize = 16;
  let className = '';
  export { className as class };

  // 'local' -> 'production' -> 'failed'. Most images only exist on
  // whichever server actually processed the upload (see api/lib/uploads.ts
  // — each environment has its own disk/volume, not shared storage), so a
  // local-dev 404 tries the known production origin once before giving up
  // to the fallback icon.
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

<div class="overflow-hidden {className}">
  {#if resolvedSrc && stage !== 'failed'}
    <img src={resolvedSrc} {alt} loading="lazy" class="h-full w-full object-cover" on:error={handleError} />
  {:else}
    <div class="flex h-full w-full items-center justify-center text-faint">
      <svelte:component this={icon} size={iconSize} />
    </div>
  {/if}
</div>
