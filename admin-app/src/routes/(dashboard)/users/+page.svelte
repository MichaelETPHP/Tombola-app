<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { toast } from '$lib/stores/toast.store.js';
  import {
    CircleAlert, MessageSquareText, RefreshCw, Search, Send,
    ShieldAlert, Trash2, Users, X, CheckSquare, Square,
    CheckCircle, ChevronLeft, ChevronRight, Copy,
  } from 'lucide-svelte';

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

  const PAGE_SIZE = 20;

  let users: AppUser[] = [];
  let loading = true;
  let loadError = false;
  let actionError = '';
  let search = '';
  let statusFilter: 'all' | 'active' | 'suspended' = 'all';
  let authFilter: 'all' | 'phone_otp' | 'telegram' = 'all';
  let currentPage = 1;

  // Suspend
  let confirmingUser: AppUser | null = null;
  let updatingId = '';

  // Selection
  let selectedIds = new Set<string>();
  $: selectedCount = selectedIds.size;

  // Delete
  let deletingId = '';

  function showToast(msg: string) {
    toast.success(msg);
  }

  // ── Filtering & Pagination ────────────────────────────────────
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

  $: totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  $: safePage = Math.min(currentPage, totalPages);
  $: pageUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filters change
  $: { normalizedSearch; statusFilter; authFilter; currentPage = 1; }

  $: activeCount    = users.filter((u) => !u.isSuspended).length;
  $: suspendedCount = users.length - activeCount;

  // Select-all only toggles the current page
  $: allPageSelected = pageUsers.length > 0 && pageUsers.every((u) => selectedIds.has(u.id));

  function togglePageSelectAll() {
    if (allPageSelected) {
      pageUsers.forEach((u) => selectedIds.delete(u.id));
    } else {
      pageUsers.forEach((u) => selectedIds.add(u.id));
    }
    selectedIds = new Set(selectedIds);
  }

  function selectAllFiltered() {
    filteredUsers.forEach((u) => selectedIds.add(u.id));
    selectedIds = new Set(selectedIds);
  }

  function toggleSelect(id: string) {
    selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id);
    selectedIds = new Set(selectedIds);
  }

  function clearSelection() { selectedIds = new Set(); }

  function goToPage(p: number) {
    currentPage = Math.max(1, Math.min(totalPages, p));
  }

  // ── Load ─────────────────────────────────────────────────────
  async function load() {
    loading = true; loadError = false;
    try {
      const res = await api.get<{ users: AppUser[] }>('/admin/users?limit=1000');
      users = res.users;
      clearSelection();
    } catch { loadError = true; }
    finally { loading = false; }
  }

  onMount(load);

  // ── Suspend ──────────────────────────────────────────────────
  async function confirmAccessChange() {
    if (!confirmingUser) return;
    const user = confirmingUser;
    actionError = ''; updatingId = user.id;
    try {
      await api.patch(`/admin/users/${user.id}/suspend`, { suspended: !user.isSuspended });
      users = users.map((u) => u.id === user.id ? { ...u, isSuspended: !u.isSuspended } : u);
      confirmingUser = null;
      showToast(`${user.phone} ${user.isSuspended ? 'restored' : 'suspended'}`);
    } catch (err) {
      actionError = err instanceof ApiError ? 'Could not update this account.' : 'Network error.';
    } finally { updatingId = ''; }
  }

  // ── Delete ────────────────────────────────────────────────────
  async function deleteSingleUser(user: AppUser) {
    if (!confirm(`Permanently delete ${user.phone} and all their data? This cannot be undone.`)) return;
    deletingId = user.id;
    try {
      await api.delete(`/admin/users/${user.id}`);
      users = users.filter((u) => u.id !== user.id);
      selectedIds.delete(user.id);
      selectedIds = new Set(selectedIds);
      toast.success(`${user.phone} and associated data deleted.`, 'User Deleted');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? 'Delete failed — ensure cascade deletes are enabled.' : 'Network error.',
        'Delete Failed'
      );
    } finally {
      deletingId = '';
    }
  }

  async function deleteBulkUsers() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} selected user${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      await api.delete('/admin/users', { ids });
      users = users.filter((u) => !selectedIds.has(u.id));
      const count = ids.length;
      clearSelection();
      toast.success(`${count} user${count !== 1 ? 's' : ''} deleted successfully.`, 'Bulk Delete Complete');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? 'Bulk delete failed.' : 'Network error.',
        'Delete Failed'
      );
    }
  }

  // Page range helper for pagination buttons
  function pageRange(cur: number, total: number): (number | '…')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '…')[] = [1];
    if (cur > 3) pages.push('…');
    for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
    if (cur < total - 2) pages.push('…');
    pages.push(total);
    return pages;
  }
</script>

<svelte:head><title>Registered Users | YeneEta Admin</title></svelte:head>

<div class="flex flex-col gap-6">

  <!-- ── Header ─────────────────────────────────────────────────── -->
  <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
        <Users size={14} /> Account management
      </div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Registered users</h1>
      <p class="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">Review accounts, control access, and remove users when needed.</p>
    </div>
    <div class="flex items-center divide-x divide-border rounded-button border border-border bg-card px-4 py-2.5">
      <div class="pr-4"><span class="font-mono text-base font-bold text-ink">{users.length}</span><span class="ml-2 text-[10px] text-muted">Total</span></div>
      <div class="px-4"><span class="font-mono text-base font-bold text-success">{activeCount}</span><span class="ml-2 text-[10px] text-muted">Active</span></div>
      <div class="pl-4"><span class="font-mono text-base font-bold text-danger">{suspendedCount}</span><span class="ml-2 text-[10px] text-muted">Suspended</span></div>
    </div>
  </header>

  <!-- ── Filters ────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <label class="relative block w-full sm:max-w-[360px]">
      <Search size={16} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <span class="sr-only">Search users</span>
      <input bind:value={search} type="search" placeholder="Search by name or phone"
        class="h-11 w-full rounded-button border border-border bg-card pl-10 pr-4 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-primary" />
    </label>
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label class="sr-only" for="auth-filter">Filter by sign-in method</label>
      <select id="auth-filter" bind:value={authFilter}
        class="h-11 rounded-button border border-border bg-card px-3 text-[11px] font-bold text-ink outline-none focus:border-primary">
        <option value="all">All sign-in methods</option>
        <option value="phone_otp">Phone OTP</option>
        <option value="telegram">Telegram Bot</option>
      </select>
      <div class="flex rounded-button border border-border bg-card p-1">
        {#each ['all', 'active', 'suspended'] as filter (filter)}
          <button type="button"
            class="admin-press min-h-9 rounded-[8px] px-3 text-[11px] font-bold capitalize {statusFilter === filter ? 'bg-primary-bg text-primary-dark' : 'text-muted'}"
            on:click={() => (statusFilter = filter as typeof statusFilter)}>{filter}</button>
        {/each}
      </div>
    </div>
  </div>

  <!-- ── Selection Banner ───────────────────────────────────────── -->
  {#if selectedCount > 0}
    <div class="flex items-center justify-between rounded-button border border-primary/20 bg-primary-bg px-4 py-2.5">
      <p class="text-[13px] font-semibold text-primary-dark">
        {selectedCount} of {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} selected
      </p>
      <div class="flex items-center gap-2">
        {#if selectedCount < filteredUsers.length}
          <button type="button"
            class="admin-press text-[11px] font-bold text-primary-dark underline underline-offset-2"
            on:click={selectAllFiltered}>
            Select all {filteredUsers.length}
          </button>
          <span class="text-primary/40">·</span>
        {/if}
        <button type="button"
          class="admin-press inline-flex h-8 items-center gap-1.5 rounded-button border border-danger/25 bg-danger-bg px-3 text-[11px] font-bold text-danger hover:bg-danger hover:text-white"
          on:click={deleteBulkUsers}>
          <Trash2 size={12} /> Delete {selectedCount}
        </button>
        <button type="button" class="admin-press text-[11px] text-muted hover:text-ink" on:click={clearSelection}>
          <X size={14} />
        </button>
      </div>
    </div>
  {/if}

  {#if actionError}
    <div class="flex items-center gap-2 rounded-button border border-danger/20 bg-danger-bg px-4 py-3 text-xs font-semibold text-danger">
      <CircleAlert size={15} /> {actionError}
    </div>
  {/if}

  <!-- ── Table ──────────────────────────────────────────────────── -->
  {#if loading}
    <div class="h-[420px] animate-pulse rounded-card bg-border"></div>
  {:else if loadError}
    <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <CircleAlert size={24} class="text-danger" />
      <div><p class="text-sm font-bold text-ink">Users could not be loaded</p><p class="mt-1 text-xs text-muted">Check the API connection and try again.</p></div>
      <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold" on:click={load}><RefreshCw size={14} /> Try again</button>
    </div>
  {:else}
    <div class="overflow-hidden rounded-card border border-border bg-card">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[700px] text-sm">
          <thead>
            <tr class="border-b border-border bg-bg text-left">
              <th class="w-12 px-4 py-3">
                <button type="button" aria-label={allPageSelected ? 'Deselect page' : 'Select page'}
                  class="admin-press flex items-center justify-center text-muted hover:text-primary-dark"
                  on:click={togglePageSelectAll}>
                  {#if allPageSelected}
                    <CheckSquare size={16} class="text-primary-dark" />
                  {:else}
                    <Square size={16} />
                  {/if}
                </button>
              </th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Account</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Name</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Sign-in</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Status</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Registered</th>
              <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#if pageUsers.length === 0}
              <tr><td colspan="7" class="px-4 py-12 text-center text-sm text-muted">No users match this search.</td></tr>
            {:else}
              {#each pageUsers as user (user.id)}
                {@const isSelected = selectedIds.has(user.id)}
                <tr class="transition-colors duration-100 {isSelected ? 'bg-primary-bg/40' : 'hover:bg-bg'}">
                  <td class="px-4 py-3">
                    <button type="button" aria-label={isSelected ? 'Deselect' : 'Select'}
                      class="admin-press flex items-center justify-center text-muted hover:text-primary-dark"
                      on:click={() => toggleSelect(user.id)}>
                      {#if isSelected}<CheckSquare size={16} class="text-primary-dark" />{:else}<Square size={16} />{/if}
                    </button>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                      <span>{user.phone}</span>
                      <button
                        type="button"
                        class="admin-press text-faint hover:text-ink transition-colors"
                        title="Copy Phone"
                        on:click={() => { navigator.clipboard.writeText(user.phone); toast.success(`Phone copied: ${user.phone}`, 'Copied'); }}
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                    <div class="mt-1 flex items-center gap-1 font-mono text-[9px] text-faint">
                      <span>{user.id.slice(0, 8)}</span>
                      <button
                        type="button"
                        class="admin-press text-faint hover:text-ink transition-colors"
                        title="Copy User ID"
                        on:click={() => { navigator.clipboard.writeText(user.id); toast.success(`User ID copied: ${user.id}`, 'Copied'); }}
                      >
                        <Copy size={9} />
                      </button>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class={user.fullName ? 'font-semibold text-ink' : 'text-faint'}>{user.fullName ?? 'Not provided'}</span>
                  </td>
                  <td class="px-4 py-3">
                    {#if user.authMethod === 'telegram'}
                      <div class="flex items-center gap-2">
                        {#if user.telegramPhotoUrl}
                          <img src={user.telegramPhotoUrl} alt="" class="h-7 w-7 rounded-[8px] object-cover" />
                        {:else}
                          <span class="flex h-7 w-7 items-center justify-center rounded-[8px] bg-info-bg text-info"><Send size={12} /></span>
                        {/if}
                        <p class="text-xs font-bold text-info">Telegram</p>
                      </div>
                    {:else}
                      <div class="flex items-center gap-2">
                        <span class="flex h-7 w-7 items-center justify-center rounded-[8px] bg-primary-bg text-primary-dark"><MessageSquareText size={12} /></span>
                        <p class="text-xs font-bold text-primary-dark">Phone OTP</p>
                      </div>
                    {/if}
                  </td>
                  <td class="px-4 py-3"><StatusBadge status={user.isSuspended ? 'suspended' : 'active'} /></td>
                  <td class="px-4 py-3 text-xs text-muted">
                    <p>{new Date(user.createdAt).toLocaleDateString()}</p>
                    <p class="mt-1 text-[10px] text-faint">{new Date(user.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <button type="button"
                        class="admin-press inline-flex h-8 items-center gap-1.5 rounded-button border px-2.5 text-[11px] font-bold {user.isSuspended ? 'border-success/20 bg-success-bg text-success' : 'border-warning/20 bg-warning-bg text-warning'}"
                        on:click={() => (confirmingUser = user)}>
                        <ShieldAlert size={12} />{user.isSuspended ? 'Restore' : 'Suspend'}
                      </button>
                      <button type="button" aria-label="Delete"
                        class="admin-press inline-flex h-8 w-8 items-center justify-center rounded-button border border-danger/20 bg-danger-bg text-danger hover:bg-danger hover:text-white disabled:opacity-50 transition-colors"
                        disabled={deletingId === user.id}
                        on:click={() => deleteSingleUser(user)}>
                        {#if deletingId === user.id}
                          <span class="h-3 w-3 animate-spin rounded-full border-2 border-danger border-t-transparent"></span>
                        {:else}
                          <Trash2 size={13} />
                        {/if}
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <!-- ── Pagination ──────────────────────────────────────────── -->
      {#if totalPages > 1 || filteredUsers.length > 0}
        <div class="flex flex-col items-center gap-3 border-t border-border px-4 py-4 sm:flex-row sm:justify-between">
          <!-- Count info -->
          <p class="text-[11px] text-faint">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
            {#if selectedCount > 0}<span class="ml-2 font-bold text-primary-dark">· {selectedCount} selected</span>{/if}
          </p>

          <!-- Page buttons — centered -->
          {#if totalPages > 1}
            <div class="flex items-center gap-1">
              <button type="button"
                class="admin-press flex h-8 w-8 items-center justify-center rounded-button border border-border bg-card text-muted disabled:opacity-30"
                disabled={safePage <= 1}
                on:click={() => goToPage(safePage - 1)}
                aria-label="Previous page">
                <ChevronLeft size={15} />
              </button>

              {#each pageRange(safePage, totalPages) as p (p)}
                {#if p === '…'}
                  <span class="px-1 text-[12px] text-faint">…</span>
                {:else}
                  <button type="button"
                    class="admin-press flex h-8 min-w-[32px] items-center justify-center rounded-button border px-2 text-[12px] font-bold {safePage === p ? 'border-primary bg-primary text-white' : 'border-border bg-card text-muted hover:bg-bg'}"
                    on:click={() => goToPage(p as number)}>
                    {p}
                  </button>
                {/if}
              {/each}

              <button type="button"
                class="admin-press flex h-8 w-8 items-center justify-center rounded-button border border-border bg-card text-muted disabled:opacity-30"
                disabled={safePage >= totalPages}
                on:click={() => goToPage(safePage + 1)}
                aria-label="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- ── Suspend Dialog ──────────────────────────────────────────── -->
{#if confirmingUser}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4">
    <div class="admin-reveal w-full max-w-[380px] rounded-card border border-border bg-card p-6 shadow-2xl">
      <h2 class="text-base font-bold text-ink">
        {confirmingUser.isSuspended ? 'Restore this account?' : 'Suspend this account?'}
      </h2>
      <p class="mt-1.5 text-sm text-muted">
        {confirmingUser.isSuspended ? `${confirmingUser.phone} will regain access.` : `${confirmingUser.phone} will lose access immediately.`}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="admin-press h-10 rounded-button border border-border px-5 text-xs font-bold text-ink" disabled={Boolean(updatingId)} on:click={() => (confirmingUser = null)}>No</button>
        <button type="button"
          class="admin-press h-10 rounded-button px-5 text-xs font-bold text-white disabled:opacity-50 {confirmingUser.isSuspended ? 'bg-success' : 'bg-warning'}"
          disabled={Boolean(updatingId)} on:click={confirmAccessChange}>
          {updatingId ? 'Updating…' : 'Yes'}
        </button>
      </div>
    </div>
  </div>
{/if}
