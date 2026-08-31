<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { CircleAlert, MessageSquareText, RefreshCw, Search, Send, ShieldAlert, Users } from 'lucide-svelte';

  interface AppUser {
    id: string;
    phone: string;
    fullName: string | null;
    authMethod: 'phone_otp' | 'telegram';
    telegramUsername: string | null;
    telegramPhotoUrl: string | null;
    telegramLinkedAt: string | null;
    isSuspended: boolean;
    createdAt: string;
  }

  let users: AppUser[] = [];
  let loading = true;
  let loadError = false;
  let actionError = '';
  let search = '';
  let statusFilter: 'all' | 'active' | 'suspended' = 'all';
  let authFilter: 'all' | 'phone_otp' | 'telegram' = 'all';
  let confirmingUser: AppUser | null = null;
  let updatingId = '';

  const columns = [
    { key: 'phone', label: 'Account', sortable: true },
    { key: 'fullName', label: 'Name' },
    { key: 'authMethod', label: 'Sign-in method', sortable: true },
    { key: 'isSuspended', label: 'Access status' },
    { key: 'createdAt', label: 'Registered', sortable: true },
    { key: 'actions', label: 'Management' },
  ];

  $: normalizedSearch = search.trim().toLowerCase();
  $: filteredUsers = users.filter((user) => {
    const matchesSearch =
      !normalizedSearch ||
      user.phone.toLowerCase().includes(normalizedSearch) ||
      (user.fullName ?? '').toLowerCase().includes(normalizedSearch) ||
      (user.telegramUsername ?? '').toLowerCase().includes(normalizedSearch);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !user.isSuspended) ||
      (statusFilter === 'suspended' && user.isSuspended);
    const matchesAuth = authFilter === 'all' || user.authMethod === authFilter;
    return matchesSearch && matchesStatus && matchesAuth;
  });
  $: activeCount = users.filter((user) => !user.isSuspended).length;
  $: suspendedCount = users.length - activeCount;

  async function load() {
    loading = true;
    loadError = false;
    try {
      const res = await api.get<{ users: AppUser[] }>('/admin/users?limit=100');
      users = res.users;
    } catch (err) {
      loadError = true;
      console.error('Failed to load users', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function confirmAccessChange() {
    if (!confirmingUser) return;
    const user = confirmingUser;
    actionError = '';
    updatingId = user.id;
    try {
      await api.patch(`/admin/users/${user.id}/suspend`, { suspended: !user.isSuspended });
      users = users.map((item) => (item.id === user.id ? { ...item, isSuspended: !item.isSuspended } : item));
      confirmingUser = null;
    } catch (err) {
      actionError = err instanceof ApiError ? 'Could not update this account.' : 'Network error. Try again.';
    } finally {
      updatingId = '';
    }
  }
</script>

<svelte:head><title>Registered Users | Tombola Admin</title></svelte:head>

<div class="flex flex-col gap-6">
  <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
        <Users size={14} /> Account management
      </div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Registered users</h1>
      <p class="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">Review participant accounts and control access when platform rules are violated.</p>
    </div>
    <div class="flex items-center divide-x divide-border rounded-button border border-border bg-card px-4 py-2.5">
      <div class="pr-4"><span class="font-mono text-base font-bold text-ink">{users.length}</span><span class="ml-2 text-[10px] text-muted">Total</span></div>
      <div class="px-4"><span class="font-mono text-base font-bold text-success">{activeCount}</span><span class="ml-2 text-[10px] text-muted">Active</span></div>
      <div class="pl-4"><span class="font-mono text-base font-bold text-danger">{suspendedCount}</span><span class="ml-2 text-[10px] text-muted">Suspended</span></div>
    </div>
  </header>

  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <label class="relative block w-full sm:max-w-[360px]">
      <Search size={16} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <span class="sr-only">Search registered users</span>
      <input bind:value={search} type="search" placeholder="Search by name or phone" class="h-11 w-full rounded-button border border-border bg-card pl-10 pr-4 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-primary" />
    </label>

    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label class="sr-only" for="auth-filter">Filter by sign-in method</label>
      <select id="auth-filter" bind:value={authFilter} class="h-11 rounded-button border border-border bg-card px-3 text-[11px] font-bold text-ink outline-none focus:border-primary">
        <option value="all">All sign-in methods</option>
        <option value="phone_otp">Phone OTP</option>
        <option value="telegram">Telegram Bot</option>
      </select>
      <div class="flex rounded-button border border-border bg-card p-1">
        {#each ['all', 'active', 'suspended'] as filter (filter)}
          <button type="button" class="admin-press min-h-9 rounded-[8px] px-3 text-[11px] font-bold capitalize {statusFilter === filter ? 'bg-primary-bg text-primary-dark' : 'text-muted'}" on:click={() => (statusFilter = filter as typeof statusFilter)}>{filter}</button>
        {/each}
      </div>
    </div>
  </div>

  {#if actionError}
    <div class="flex items-center gap-2 rounded-button border border-danger/20 bg-danger-bg px-4 py-3 text-xs font-semibold text-danger"><CircleAlert size={15} /> {actionError}</div>
  {/if}

  {#if loading}
    <div class="h-[420px] animate-pulse rounded-card bg-border"></div>
  {:else if loadError}
    <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <CircleAlert size={24} class="text-danger" />
      <div><p class="text-sm font-bold text-ink">Users could not be loaded</p><p class="mt-1 text-xs text-muted">Check the API connection and try again.</p></div>
      <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold" on:click={load}><RefreshCw size={14} /> Try again</button>
    </div>
  {:else}
    <DataTable columns={columns} rows={filteredUsers} emptyMessage="No users match this search.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'phone'}
          <div><p class="font-mono text-xs font-semibold text-ink">{row.phone}</p><p class="mt-1 font-mono text-[9px] text-faint">{row.id.slice(0, 8)}</p></div>
        {:else if column === 'fullName'}
          <span class={row.fullName ? 'font-semibold text-ink' : 'text-faint'}>{row.fullName ?? 'Not provided'}</span>
        {:else if column === 'authMethod'}
          {#if row.authMethod === 'telegram'}
            <div class="flex items-center gap-2.5">
              {#if row.telegramPhotoUrl}
                <img src={row.telegramPhotoUrl} alt="" class="h-8 w-8 rounded-[10px] object-cover" />
              {:else}
                <span class="flex h-8 w-8 items-center justify-center rounded-[10px] bg-info-bg text-info"><Send size={14} /></span>
              {/if}
              <div><p class="text-xs font-bold text-info">Telegram Bot</p><p class="mt-0.5 text-[10px] text-faint">{row.telegramUsername ? `@${row.telegramUsername}` : 'Linked account'}</p></div>
            </div>
          {:else}
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary-bg text-primary-dark"><MessageSquareText size={14} /></span>
              <div><p class="text-xs font-bold text-primary-dark">Phone OTP</p><p class="mt-0.5 text-[10px] text-faint">SMS verification</p></div>
            </div>
          {/if}
        {:else if column === 'isSuspended'}
          <StatusBadge status={row.isSuspended ? 'suspended' : 'active'} />
        {:else if column === 'createdAt'}
          <div><p>{new Date(row.createdAt).toLocaleDateString()}</p><p class="mt-1 text-[10px] text-faint">{new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
        {:else if column === 'actions'}
          <button
            type="button"
            class="admin-press inline-flex h-9 items-center gap-2 rounded-button border px-3 text-[11px] font-bold {row.isSuspended ? 'border-success/20 bg-success-bg text-success' : 'border-danger/20 bg-danger-bg text-danger'}"
            on:click={() => (confirmingUser = row)}
          >
            <ShieldAlert size={13} /> {row.isSuspended ? 'Restore access' : 'Suspend'}
          </button>
        {:else}
          {(row as unknown as Record<string, unknown>)[column]}
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}
</div>

{#if confirmingUser}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-sidebar/45 p-4 backdrop-blur-sm" role="presentation">
    <div class="admin-reveal w-full max-w-[430px] rounded-card border border-border bg-card p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="access-dialog-title">
      <span class="mb-4 flex h-11 w-11 items-center justify-center rounded-[14px] {confirmingUser.isSuspended ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}"><ShieldAlert size={20} /></span>
      <h2 id="access-dialog-title" class="text-lg font-bold text-ink">{confirmingUser.isSuspended ? 'Restore account access?' : 'Suspend this account?'}</h2>
      <p class="mt-2 text-sm leading-relaxed text-muted">
        {confirmingUser.isSuspended
          ? `${confirmingUser.phone} will be able to sign in and enter raffles again.`
          : `${confirmingUser.phone} will immediately lose access to authenticated platform actions.`}
      </p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="admin-press h-10 rounded-button border border-border px-4 text-xs font-bold text-ink" disabled={Boolean(updatingId)} on:click={() => (confirmingUser = null)}>Cancel</button>
        <button type="button" class="admin-press h-10 rounded-button px-4 text-xs font-bold text-white disabled:opacity-50 {confirmingUser.isSuspended ? 'bg-success' : 'bg-danger'}" disabled={Boolean(updatingId)} on:click={confirmAccessChange}>{updatingId ? 'Updating…' : confirmingUser.isSuspended ? 'Restore access' : 'Suspend account'}</button>
      </div>
    </div>
  </div>
{/if}
