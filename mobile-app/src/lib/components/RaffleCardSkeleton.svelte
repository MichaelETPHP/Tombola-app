<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="grid min-h-[152px] grid-cols-[116px_1fr] overflow-hidden rounded-card border border-white/70 bg-card shadow-card-light">
  <Skeleton class="h-full min-h-[152px] w-full rounded-none" />
  <div class="flex flex-col justify-between gap-3 p-3.5">
    <div class="flex flex-col gap-2">
      <Skeleton class="h-4 w-4/5 rounded-full" />
      <Skeleton class="h-3 w-3/5 rounded-full" />
    </div>
    <div class="flex flex-col gap-2">
      <Skeleton class="h-1.5 w-full rounded-full" />
      <div class="flex justify-between">
        <Skeleton class="h-2.5 w-14 rounded-full" />
        <Skeleton class="h-2.5 w-10 rounded-full" />
      </div>
    </div>
    <div class="flex items-end justify-between border-t border-dot-inactive/70 pt-2">
      <Skeleton class="h-7 w-16 rounded-full" />
      <Skeleton class="h-7 w-20 rounded-full" />
    </div>
  </div>
</div>
