<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { setAuth } from '$lib/stores/auth.store.js';
  import Button from '$lib/components/Button.svelte';
  import { verifyOtpSchema, type AuthResponse } from '$lib/schemas/index.js';

  let phone = '';
  let code = '';
  let error = '';
  let loading = false;

  onMount(() => {
    phone = $page.url.searchParams.get('phone') ?? '';
  });

  async function submit() {
    error = '';
    const parsed = verifyOtpSchema.safeParse({ phone, code });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter the 6-digit code';
      return;
    }

    loading = true;
    try {
      const result = await api.post<AuthResponse>(
        '/auth/otp/verify',
        { phone, code },
        { skipAuth: true }
      );
      setAuth(result.accessToken, result.user);
      goto('/home', { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? 'Invalid or expired code.' : 'Network error.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="screen safe-area-top safe-area-bottom">
  <div class="hero">
    <h1>Verify your number</h1>
    <p>We sent a 6-digit code to {phone}</p>
  </div>

  <form class="card" on:submit|preventDefault={submit}>
    <label for="code">Verification code</label>
    <input
      id="code"
      type="text"
      inputmode="numeric"
      maxlength="6"
      placeholder="000000"
      bind:value={code}
      autocomplete="one-time-code"
    />
    {#if error}
      <p class="error">{error}</p>
    {/if}
    <Button type="submit" {loading}>Verify</Button>
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
    gap: var(--space-8);
    text-align: center;
  }

  h1 {
    font-size: 24px;
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
    font-size: 20px;
    letter-spacing: 4px;
    text-align: center;
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
