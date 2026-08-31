<script lang="ts">
  import { api, ApiError } from '$lib/api/client.js';
  import { auth, updateOwnAdminInStore } from '$lib/stores/auth.store.js';
  import type { Admin } from '$lib/schemas/index.js';
  import { Check, Eye, EyeOff, KeyRound, Shield, UserRound, Users } from 'lucide-svelte';

  let fullName = $auth.admin?.fullName ?? '';
  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let showPasswords = false;
  let saving = false;
  let error = '';
  let success = '';

  async function save() {
    error = '';
    success = '';

    if (newPassword && newPassword !== confirmPassword) {
      error = 'New password and confirmation do not match.';
      return;
    }

    const payload: Record<string, unknown> = {};
    if (fullName.trim() !== ($auth.admin?.fullName ?? '')) payload.fullName = fullName.trim();
    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }
    if (Object.keys(payload).length === 0) {
      success = 'Nothing to save.';
      return;
    }

    saving = true;
    try {
      const res = await api.patch<{ admin: Admin }>('/admin/auth/me', payload);
      updateOwnAdminInStore(res.admin);
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      success = 'Profile updated.';
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        error = 'Current password is incorrect.';
      } else {
        error = err instanceof ApiError ? 'Could not save changes.' : 'Network error.';
      }
    } finally {
      saving = false;
    }
  }

  const inputClass = 'h-11 w-full rounded-button border border-border bg-bg/55 px-3.5 text-sm text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none';
  const labelClass = 'flex flex-col gap-2 text-xs font-bold text-ink';
</script>

<svelte:head><title>Settings · Tombola Admin</title></svelte:head>

<div class="admin-reveal">
  <header class="mb-7">
    <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Account</p>
    <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">Settings</h1>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">Manage your own profile and password.</p>
  </header>

  {#if $auth.admin?.role === 'owner'}
    <a
      href="/settings/admins"
      class="admin-press mb-5 flex items-center gap-3 rounded-card border border-border bg-card p-5 text-inherit no-underline"
    >
      <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary-bg text-primary"><Users size={18} /></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-bold text-ink">Admin users</p>
        <p class="mt-0.5 text-xs text-faint">Create, edit or remove other admin accounts</p>
      </div>
    </a>
  {/if}

  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <form class="rounded-card border border-border bg-card p-5 sm:p-6" on:submit|preventDefault={save}>
      <div class="mb-6 flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary-bg text-primary"><UserRound size={18} /></span><div><h2 class="text-sm font-bold text-ink">Profile</h2><p class="mt-0.5 text-xs text-faint">Your name as shown throughout the dashboard</p></div></div>

      <label class={labelClass}>Full name<input bind:value={fullName} class={inputClass} placeholder="Your name" /></label>

      <div class="mt-6 mb-6 flex items-center gap-3 border-t border-border pt-6"><span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary-bg text-primary"><KeyRound size={18} /></span><div><h2 class="text-sm font-bold text-ink">Change password</h2><p class="mt-0.5 text-xs text-faint">Leave blank to keep your current password</p></div></div>

      <div class="grid gap-5 sm:grid-cols-2">
        <label class="sm:col-span-2 {labelClass}">
          Current password
          <div class="relative">
            <input type={showPasswords ? 'text' : 'password'} bind:value={currentPassword} class={inputClass} autocomplete="current-password" />
            <button type="button" class="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-bg hover:text-ink" aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'} on:click={() => (showPasswords = !showPasswords)}>
              {#if showPasswords}<EyeOff size={15} />{:else}<Eye size={15} />{/if}
            </button>
          </div>
        </label>
        <label class={labelClass}>New password<input type={showPasswords ? 'text' : 'password'} bind:value={newPassword} class={inputClass} autocomplete="new-password" /></label>
        <label class={labelClass}>Confirm new password<input type={showPasswords ? 'text' : 'password'} bind:value={confirmPassword} class={inputClass} autocomplete="new-password" /></label>
      </div>

      {#if error}<p class="mt-4 rounded-button bg-danger-bg px-4 py-3 text-xs font-medium text-danger" role="alert">{error}</p>{/if}
      {#if success}<p class="mt-4 flex items-center gap-2 rounded-button bg-success-bg px-4 py-3 text-xs font-medium text-success"><Check size={15} /> {success}</p>{/if}

      <button type="submit" disabled={saving} class="admin-press mt-6 h-11 rounded-button bg-primary px-6 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
    </form>

    <aside class="space-y-5">
      <section class="rounded-card border border-border bg-card p-5">
        <div class="mb-4 flex items-center gap-2.5"><Shield size={17} class="text-primary" /><h2 class="text-sm font-bold text-ink">Account details</h2></div>
        <dl class="space-y-3 text-xs">
          <div class="flex justify-between gap-3"><dt class="text-faint">Phone</dt><dd class="font-semibold text-ink">{$auth.admin?.phone ?? '—'}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-faint">Role</dt><dd class="font-semibold text-ink">{$auth.admin?.role === 'owner' ? 'Super Admin' : 'Moderator'}</dd></div>
        </dl>
      </section>
    </aside>
  </div>
</div>
