<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="flex h-[calc(100dvh-140px)] min-h-0 flex-col gap-3 overflow-hidden" aria-busy="true" aria-label="Loading raffle">
  <Skeleton class="h-[166px] shrink-0 rounded-[26px]" />
  <div class="flex flex-col gap-2">
    <Skeleton class="h-5 w-4/5 rounded-full" />
    <Skeleton class="h-3 w-3/5 rounded-full" />
  </div>
  <div class="flex flex-col gap-1.5">
    <Skeleton class="h-3 w-full rounded-full" />
    <Skeleton class="h-3 w-5/6 rounded-full" />
  </div>
  <div class="flex h-[246px] shrink-0 flex-col justify-between rounded-card bg-card p-4 shadow-card-light">
    <div class="flex justify-around">
      <Skeleton class="h-16 w-16 rounded-full" />
      <Skeleton class="h-16 w-16 rounded-full" />
    </div>
    <Skeleton class="h-1.5 w-full rounded-full" />
    <Skeleton class="h-10 w-full rounded-button" />
    <Skeleton class="h-11 w-full rounded-button" />
  </div>
</div>
