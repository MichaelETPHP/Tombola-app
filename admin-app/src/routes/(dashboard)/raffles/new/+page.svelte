<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import RaffleForm from '$lib/components/RaffleForm.svelte';
  import type { CreateRaffleInput, Raffle } from '$lib/schemas/index.js';
  import { ArrowLeft } from 'lucide-svelte';

  let submitting = false;
  let errorMessage = '';

  $: canCreate = $auth.admin?.role === 'owner' || $auth.admin?.role === 'moderator';

  async function handleSubmit(event: CustomEvent<CreateRaffleInput>) {
    errorMessage = '';
    submitting = true;
    try {
      const res = await api.post<{ raffle: Raffle }>('/admin/raffles', event.detail);
      goto(`/raffles/${res.raffle.id}`);
    } catch (err) {
      errorMessage = err instanceof ApiError ? 'Could not create raffle.' : 'Network error.';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>Create raffle · YeneEta Admin</title></svelte:head>

<div class="admin-reveal">
  <a href="/raffles" class="admin-press mb-5 inline-flex min-h-10 items-center gap-2 rounded-button px-2 text-xs font-bold text-muted no-underline hover:bg-card hover:text-ink"><ArrowLeft size={15} /> Back to raffles</a>
  <header class="mb-7 border-b border-border pb-6">
    <h1 class="text-[30px] font-bold leading-tight tracking-[-0.03em] text-ink md:text-[38px]">Create a profitable raffle</h1>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">Build the prize offer and sales rules while the live preview checks break-even volume, sell-out revenue, and projected gross profit.</p>
  </header>

  {#if !canCreate}
    <p class="rounded-card border border-danger/15 bg-danger-bg p-5 text-sm text-danger">Your role does not permit creating raffles.</p>
  {:else}
    <RaffleForm {submitting} {errorMessage} on:submit={handleSubmit} />
  {/if}
</div>
