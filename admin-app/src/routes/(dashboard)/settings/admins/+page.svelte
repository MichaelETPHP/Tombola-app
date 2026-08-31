<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import type { Admin } from '$lib/schemas/index.js';
  import { createAdminSchema } from '$lib/schemas/index.js';
  import { ArrowLeft, Check, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-svelte';

  let admins: Admin[] = [];
  let loading = true;
  let error = '';
  let success = '';

  let showCreateForm = false;
  let phone = '';
  let password = '';
  let fullName = '';
  let role: 'owner' | 'moderator' = 'moderator';
  let creating = false;
  let fieldErrors: Record<string, string> = {};

  let deletingId = '';

  async function load() {
    loading = true;
    try {
      const res = await api.get<{ admins: Admin[] }>('/admin/admins');
      admins = res.admins;
    } catch (err) {
      error = err instanceof ApiError ? 'Could not load admin accounts.' : 'Network error.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    // Owner-only page — the API already enforces this, this just avoids a
    // moderator landing on a page full of error states.
    if ($auth.admin && $auth.admin.role !== 'owner') {
      goto('/settings', { replaceState: true });
      return;
    }
    load();
  });

  async function createAdmin() {
    fieldErrors = {};
    error = '';
    success = '';
    const parsed = createAdminSchema.safeParse({
      phone,
      password,
      fullName: fullName || undefined,
      role,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as string] = issue.message;
      return;
    }

    creating = true;
    try {
      await api.post<{ admin: Admin }>('/admin/admins', parsed.data);
      phone = '';
      password = '';
      fullName = '';
      role = 'moderator';
      showCreateForm = false;
      success = 'Admin account created.';
      await load();
    } catch (err) {
      error = err instanceof ApiError ? 'Could not create that admin — the phone number may already be in use.' : 'Network error.';
    } finally {
      creating = false;
    }
  }

  async function removeAdmin(admin: Admin) {
    if (admin.id === $auth.admin?.id) return;
    if (!confirm(`Remove ${admin.fullName ?? admin.phone} as an admin? This cannot be undone.`)) return;

    deletingId = admin.id;
    error = '';
    try {
      await api.delete(`/admin/admins/${admin.id}`);
      admins = admins.filter((a) => a.id !== admin.id);
    } catch (err) {
      error = err instanceof ApiError ? 'Could not remove that admin.' : 'Network error.';
    } finally {
      deletingId = '';
    }
  }

  const inputClass = 'h-11 w-full rounded-button border border-border bg-bg/55 px-3.5 text-sm text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none';
  const labelClass = 'flex flex-col gap-2 text-xs font-bold text-ink';
</script>

<svelte:head><title>Admin users · Tombola Admin</title></svelte:head>

<div class="admin-reveal">
  <a href="/settings" class="mb-5 inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-ink"><ArrowLeft size={15} /> Back to settings</a>
  <header class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>
      <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Owner only</p>
      <h1 class="text-[28px] font-bold tracking-[-0.03em] text-ink">Admin users</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">Create, edit or remove admin accounts.</p>
    </div>
    <button type="button" class="admin-press inline-flex h-11 shrink-0 items-center gap-2 rounded-button bg-primary px-5 text-xs font-bold text-white" on:click={() => (showCreateForm = !showCreateForm)}>
      {#if showCreateForm}<X size={15} /> Cancel{:else}<UserPlus size={15} /> New admin{/if}
    </button>
  </header>

  {#if error}<p class="mb-4 rounded-button bg-danger-bg px-4 py-3 text-xs font-medium text-danger" role="alert">{error}</p>{/if}
  {#if success}<p class="mb-4 flex items-center gap-2 rounded-button bg-success-bg px-4 py-3 text-xs font-medium text-success"><Check size={15} /> {success}</p>{/if}

  {#if showCreateForm}
    <form class="mb-5 rounded-card border border-border bg-card p-5 sm:p-6" on:submit|preventDefault={createAdmin}>
      <div class="grid gap-5 sm:grid-cols-2">
        <label class={labelClass}>Phone number<input bind:value={phone} class={inputClass} placeholder="+251 91 234 5678" />{#if fieldErrors.phone}<span class="text-[11px] text-danger">{fieldErrors.phone}</span>{/if}</label>
        <label class={labelClass}>Full name <span class="font-medium text-faint">(optional)</span><input bind:value={fullName} class={inputClass} placeholder="Jane Doe" /></label>
        <label class={labelClass}>Password<input type="password" bind:value={password} class={inputClass} autocomplete="new-password" />{#if fieldErrors.password}<span class="text-[11px] text-danger">{fieldErrors.password}</span>{/if}</label>
        <label class={labelClass}>Role
          <select bind:value={role} class={inputClass}>
            <option value="moderator">Moderator</option>
            <option value="owner">Super Admin (owner)</option>
          </select>
        </label>
      </div>
      <button type="submit" disabled={creating} class="admin-press mt-5 flex h-11 items-center gap-2 rounded-button bg-primary px-6 text-xs font-bold text-white disabled:opacity-50"><Plus size={15} /> {creating ? 'Creating…' : 'Create admin'}</button>
    </form>
  {/if}

  {#if loading}
    <div class="space-y-3">{#each Array(3) as _}<div class="h-16 animate-pulse rounded-card bg-card"></div>{/each}</div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each admins as admin (admin.id)}
        <div class="flex items-center gap-4 rounded-card border border-border bg-card p-4">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-primary-bg text-primary"><ShieldCheck size={17} /></span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-ink">{admin.fullName ?? admin.phone}{admin.id === $auth.admin?.id ? ' (you)' : ''}</p>
            <p class="mt-0.5 text-xs text-faint">{admin.phone} · {admin.role === 'owner' ? 'Super Admin' : 'Moderator'}</p>
          </div>
          {#if admin.id !== $auth.admin?.id}
            <button
              type="button"
              disabled={deletingId === admin.id}
              class="admin-press flex h-9 w-9 shrink-0 items-center justify-center rounded-button border border-danger/20 bg-danger-bg text-danger disabled:opacity-50"
              aria-label="Remove admin"
              on:click={() => removeAdmin(admin)}
            >
              <Trash2 size={15} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
