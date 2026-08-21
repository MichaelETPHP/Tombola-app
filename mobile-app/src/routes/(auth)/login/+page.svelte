<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import Button from '$lib/components/Button.svelte';
  import { requestOtpSchema } from '$lib/schemas/index.js';

  let phone = '';
  let error = '';
  let loading = false;

  async function submit() {
    error = '';
    const parsed = requestOtpSchema.safeParse({ phone });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter a valid phone number';
      return;
    }

    loading = true;
    try {
      await api.post('/auth/otp/request', { phone }, { skipAuth: true });
      goto(`/verify?phone=${encodeURIComponent(phone)}`);
    } catch (err) {
      error = err instanceof ApiError ? 'Could not send code. Please try again.' : 'Network error.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="screen safe-area-top safe-area-bottom">
  <div class="hero">
    <span class="logo">🎰</span>
    <h1>Tombola</h1>
    <p>Enter your phone number to get started</p>
  </div>

  <form class="card" on:submit|preventDefault={submit}>
    <label for="phone">Phone number</label>
    <input
      id="phone"
      type="tel"
      inputmode="tel"
      placeholder="09XXXXXXXX"
      bind:value={phone}
      autocomplete="tel"
    />
    {#if error}
      <p class="error">{error}</p>
    {/if}
    <Button type="submit" {loading}>Send code</Button>
  </form>
</div>

<style>
  .screen {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--space-24);
    gap: var(--space-32);
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-8);
    text-align: center;
  }

  .logo {
    font-size: 40px;
  }

  h1 {
    font-size: 28px;
    font-weight: 800;
  }

  .hero p {
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    background: var(--color-card-bg);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-24);
  }

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  input {
    height: 48px;
    border-radius: var(--radius-button);
    border: 1px solid var(--color-dot-inactive);
    padding: 0 var(--space-16);
    font-size: 16px;
    font-family: var(--font-family);
  }

  input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .error {
    font-size: 13px;
    color: var(--color-coral-start);
  }
</style>
