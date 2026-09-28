<script lang="ts">
  import { dicebearAvatarUri } from '$lib/utils/avatar.js';

  export let seed: string;
  export let alt = '';
  let className = '';
  export { className as class };

  // dicebearAvatarUri lazy-loads its (large) dependency on first call — a
  // brief gap between mount and the image having a source is expected and
  // fine here, not a bug to hide. `lastSeed` guards against a stale resolve
  // landing after `seed` has already changed again (a fast-scrolling chat
  // reusing this component across different senders).
  let uri = '';
  let lastSeed = '';
  $: if (seed !== lastSeed) {
    lastSeed = seed;
    uri = '';
    dicebearAvatarUri(seed).then((resolved) => {
      if (seed === lastSeed) uri = resolved;
    });
  }
</script>

{#if uri}
  <img src={uri} {alt} class={className} />
{/if}
