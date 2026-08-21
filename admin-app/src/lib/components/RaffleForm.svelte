<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { createRaffleSchema, type CreateRaffleInput } from '../schemas/index.js';

  const dispatch = createEventDispatcher<{ submit: CreateRaffleInput }>();

  export let submitting = false;
  export let errorMessage = '';

  let title = '';
  let description = '';
  let prizeName = '';
  let prizeValue = '';
  let ticketPrice = '';
  let ticketCap = '';
  let maxTicketsPerUser = '';
  let deadlineDays = '';
  let fieldErrors: Record<string, string> = {};

  function handleSubmit() {
    fieldErrors = {};

    const parsed = createRaffleSchema.safeParse({
      title,
      description: description || undefined,
      prizeName,
      prizeValue: Number(prizeValue),
      ticketPrice: Number(ticketPrice),
      ticketCap: Number(ticketCap),
      maxTicketsPerUser: Number(maxTicketsPerUser),
      deadlineDays: Number(deadlineDays),
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      return;
    }

    dispatch('submit', parsed.data);
  }
</script>

<form class="raffle-form" on:submit|preventDefault={handleSubmit}>
  <div class="field">
    <label for="title">Title</label>
    <input id="title" type="text" bind:value={title} />
    {#if fieldErrors.title}<span class="field-error">{fieldErrors.title}</span>{/if}
  </div>

  <div class="field">
    <label for="description">Description</label>
    <textarea id="description" rows="3" bind:value={description}></textarea>
  </div>

  <div class="grid">
    <div class="field">
      <label for="prizeName">Prize name</label>
      <input id="prizeName" type="text" bind:value={prizeName} />
      {#if fieldErrors.prizeName}<span class="field-error">{fieldErrors.prizeName}</span>{/if}
    </div>

    <div class="field">
      <label for="prizeValue">Prize value (ETB)</label>
      <input id="prizeValue" type="number" min="0" step="0.01" bind:value={prizeValue} />
      {#if fieldErrors.prizeValue}<span class="field-error">{fieldErrors.prizeValue}</span>{/if}
    </div>

    <div class="field">
      <label for="ticketPrice">Ticket price (ETB)</label>
      <input id="ticketPrice" type="number" min="0" step="0.01" bind:value={ticketPrice} />
      {#if fieldErrors.ticketPrice}<span class="field-error">{fieldErrors.ticketPrice}</span>{/if}
    </div>

    <div class="field">
      <label for="ticketCap">Ticket cap</label>
      <input id="ticketCap" type="number" min="10" step="1" bind:value={ticketCap} />
      {#if fieldErrors.ticketCap}<span class="field-error">{fieldErrors.ticketCap}</span>{/if}
    </div>

    <div class="field">
      <label for="maxTicketsPerUser">Max tickets / user</label>
      <input id="maxTicketsPerUser" type="number" min="1" max="100" step="1" bind:value={maxTicketsPerUser} />
      {#if fieldErrors.maxTicketsPerUser}<span class="field-error">{fieldErrors.maxTicketsPerUser}</span>{/if}
    </div>

    <div class="field">
      <label for="deadlineDays">Deadline (days)</label>
      <input id="deadlineDays" type="number" min="1" max="90" step="1" bind:value={deadlineDays} />
      {#if fieldErrors.deadlineDays}<span class="field-error">{fieldErrors.deadlineDays}</span>{/if}
    </div>
  </div>

  <p class="hint">
    Prize photo upload isn't wired up yet — the API doesn't expose an image
    endpoint for raffles yet, only <code>lib/image.ts</code>'s sharp wrapper.
    Add <code>prizeImageUrl</code> to the create-raffle contract once it does.
  </p>

  {#if errorMessage}
    <p class="form-error">{errorMessage}</p>
  {/if}

  <button type="submit" class="submit" disabled={submitting}>
    {submitting ? 'Creating…' : 'Create raffle'}
  </button>
</form>

<style>
  .raffle-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-20);
    background: var(--color-card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-24);
    max-width: 640px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-16);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  input,
  textarea {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-button);
    padding: var(--space-8) var(--space-12);
    font-size: 14px;
    font-family: var(--font-family);
    color: var(--color-text-primary);
  }

  input:focus,
  textarea:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .field-error {
    font-size: 12px;
    color: var(--color-danger);
  }

  .hint {
    font-size: 12px;
    color: var(--color-text-muted);
    background: var(--color-bg);
    border-radius: var(--radius-button);
    padding: var(--space-12);
  }

  .hint code {
    font-family: monospace;
  }

  .form-error {
    font-size: 13px;
    color: var(--color-danger);
  }

  .submit {
    align-self: flex-start;
    background: var(--color-primary);
    color: #ffffff;
    border: none;
    border-radius: var(--radius-button);
    padding: var(--space-12) var(--space-24);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
