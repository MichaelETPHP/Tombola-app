<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="flex items-center gap-4 rounded-card bg-card p-4 shadow-card">
  <Skeleton class="h-6 w-6 shrink-0 rounded-full" />
  <div class="flex flex-1 flex-col gap-2">
    <Skeleton class="h-3.5 w-3/5 rounded-full" />
    <Skeleton class="h-3 w-2/5 rounded-full" />
  </div>
</div>
