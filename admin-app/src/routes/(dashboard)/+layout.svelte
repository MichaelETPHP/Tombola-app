<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.store.js';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';

  $: if (!$auth.isLoading && !$auth.isAuthenticated) {
    goto('/login', { replaceState: true });
  }
</script>

<ToastContainer />

{#if $auth.isLoading}
  <div class="flex min-h-[100dvh] bg-bg">
    <div class="hidden w-[268px] animate-pulse bg-sidebar lg:block"></div>
    <main class="w-full max-w-[1480px] flex-1 p-4 md:p-7 xl:p-9">
      <div class="mb-8 h-8 w-48 animate-pulse rounded-button bg-border"></div>
      <div class="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div class="h-64 animate-pulse rounded-card bg-border"></div>
        <div class="h-64 animate-pulse rounded-card bg-border"></div>
      </div>
    </main>
  </div>
{:else if $auth.isAuthenticated}
  <div class="min-h-[100dvh] bg-bg lg:flex">
    <Sidebar />
    <main class="admin-reveal mx-auto w-full max-w-[1480px] flex-1 p-4 pb-10 md:p-7 xl:p-9">
      <slot />
    </main>
  </div>
{/if}
