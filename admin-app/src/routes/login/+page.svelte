<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { setAuth } from '$lib/stores/auth.store.js';
  import { adminLoginSchema, type AdminAuthResponse } from '$lib/schemas/index.js';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  async function submit() {
    error = '';
    const parsed = adminLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter a valid email and password';
      return;
    }

    loading = true;
    try {
      const result = await api.post<AdminAuthResponse>('/admin/auth/login', parsed.data, {
        skipAuth: true,
      });
      setAuth(result.accessToken, result.admin);
      goto('/', { replaceState: true });
    } catch (err) {
      error =
        err instanceof ApiError
          ? 'Invalid credentials, or /admin/auth/login is not implemented on the API yet.'
          : 'Network error.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="screen">
  <form class="card" on:submit|preventDefault={submit}>
    <div class="brand">
      <span class="logo">🎰</span>
      <h1>Tombola Admin</h1>
    </div>

    <div class="field">
      <label for="email">Email</label>
      <input id="email" type="email" bind:value={email} autocomplete="username" />
    </div>

    <div class="field">
      <label for="password">Password</label>
      <input id="password" type="password" bind:value={password} autocomplete="current-password" />
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
  </form>
</div>

<style>
  .screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-sidebar-bg);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-20);
    background: var(--color-card-bg);
    border-radius: var(--radius-card);
    padding: var(--space-32);
    width: 360px;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-8);
  }

  .logo {
    font-size: 32px;
  }

  h1 {
    font-size: 18px;
    font-weight: 700;
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

  input {
    height: 44px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-button);
    padding: 0 var(--space-12);
    font-size: 14px;
  }

  input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .error {
    font-size: 13px;
    color: var(--color-danger);
  }

  button {
    height: 44px;
    border: none;
    border-radius: var(--radius-button);
    background: var(--color-primary);
    color: #ffffff;
    font-weight: 600;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
