<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card">
  <div class="flex items-center gap-2">
    <Skeleton class="h-9 w-9 shrink-0 rounded-full" />
    <Skeleton class="h-3.5 w-20 rounded-full" />
  </div>

  <div class="flex items-end justify-between gap-2">
    <div class="flex min-w-0 flex-col gap-2">
      <Skeleton class="h-7 w-12 rounded-button" />
      <Skeleton class="h-3 w-24 rounded-full" />
    </div>
  </div>
</div>
