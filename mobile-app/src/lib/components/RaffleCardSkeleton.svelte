<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="flex items-stretch gap-3 rounded-[18px] border border-white/70 bg-card p-2.5 shadow-card-light">
  <Skeleton class="h-[96px] w-[96px] shrink-0 rounded-[14px]" />
  <div class="flex min-w-0 flex-1 flex-col justify-center gap-2 py-0.5">
    <div class="flex flex-col gap-1.5">
      <Skeleton class="h-4 w-4/5 rounded-full" />
      <Skeleton class="h-2.5 w-3/5 rounded-full" />
    </div>
    <div class="flex items-center justify-between gap-2">
      <Skeleton class="h-4 w-16 rounded-full" />
      <Skeleton class="h-2.5 w-20 rounded-full" />
    </div>
    <Skeleton class="h-2.5 w-24 rounded-full" />
  </div>
</div>
