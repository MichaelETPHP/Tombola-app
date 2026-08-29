<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="flex flex-col gap-3">
  <Skeleton class="h-[238px] w-full rounded-card" />
  <div class="flex justify-center gap-2">
    <Skeleton class="h-1.5 w-6 rounded-full" />
    <Skeleton class="h-1.5 w-1.5 rounded-full" />
    <Skeleton class="h-1.5 w-1.5 rounded-full" />
  </div>
</div>
