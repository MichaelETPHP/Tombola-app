<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading featured raffles">
  <Skeleton class="h-[346px] w-full rounded-[24px]" />
  <div class="flex justify-center gap-2">
    <Skeleton class="h-1.5 w-5 rounded-full" />
    <Skeleton class="h-1.5 w-1.5 rounded-full" />
    <Skeleton class="h-1.5 w-1.5 rounded-full" />
  </div>
</div>
