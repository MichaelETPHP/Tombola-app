<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import RaffleForm from '$lib/components/RaffleForm.svelte';
  import type { CreateRaffleInput, Raffle } from '$lib/schemas/index.js';

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

<h1>New raffle</h1>

{#if !canCreate}
  <p class="denied">Your role does not permit creating raffles.</p>
{:else}
  <RaffleForm {submitting} {errorMessage} on:submit={handleSubmit} />
{/if}

<style>
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: var(--space-20);
  }

  .denied {
    color: var(--color-danger);
    font-size: 14px;
  }
</style>
