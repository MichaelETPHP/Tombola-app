<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth, clearAuth } from '$lib/stores/auth.store.js';
  import Button from '$lib/components/Button.svelte';

  let fullName = $auth.user?.fullName ?? '';
  let saving = false;
  let saved = false;
  let error = '';

  async function save() {
    error = '';
    saving = true;
    try {
      const res = await api.patch<{ user: typeof $auth.user }>('/users/me', { fullName });
      auth.update((state) => ({ ...state, user: res.user }));
      saved = true;
    } catch (err) {
      error = err instanceof ApiError ? 'Could not update profile.' : 'Network error.';
    } finally {
      saving = false;
    }
  }

  async function logout() {
    clearAuth();
    goto('/login', { replaceState: true });
  }
</script>

<div class="profile-page">
  <h1>Profile</h1>

  <div class="card">
    <label for="phone">Phone number</label>
    <input id="phone" type="text" value={$auth.user?.phone ?? ''} disabled />

    <label for="name">Full name</label>
    <input id="name" type="text" bind:value={fullName} placeholder="Add your name" />

    {#if error}
      <p class="error">{error}</p>
    {/if}
    {#if saved}
      <p class="success">Saved.</p>
    {/if}

    <Button variant="secondary" loading={saving} on:click={save}>Save changes</Button>
  </div>

  <Button variant="ghost" on:click={logout}>Log out</Button>
</div>

<style>
  .profile-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-20);
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    background: var(--color-card-bg);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-16);
  }

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  input {
    height: 44px;
    border-radius: var(--radius-button);
    border: 1px solid var(--color-dot-inactive);
    padding: 0 var(--space-16);
    font-size: 15px;
    font-family: var(--font-family);
  }

  input:disabled {
    background: var(--bg-gradient-start);
    color: var(--color-text-secondary);
  }

  input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .error {
    font-size: 13px;
    color: var(--color-coral-start);
  }

  .success {
    font-size: 13px;
    color: var(--color-primary-dark);
  }
</style>
