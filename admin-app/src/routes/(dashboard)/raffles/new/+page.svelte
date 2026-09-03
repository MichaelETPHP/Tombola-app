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
  <a href="/raffles" class="mb-5 inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-ink"><ArrowLeft size={15} /> Back to raffles</a>
  <header class="mb-7">
    <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Prize setup</p>
    <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">Create a new raffle</h1>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">Define the prize, ticket quota and participant limits. You can review the raffle before opening ticket sales.</p>
  </header>

  {#if !canCreate}
    <p class="rounded-card border border-danger/15 bg-danger-bg p-5 text-sm text-danger">Your role does not permit creating raffles.</p>
  {:else}
    <RaffleForm {submitting} {errorMessage} on:submit={handleSubmit} />
  {/if}
</div>
