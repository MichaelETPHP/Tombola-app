<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';

  interface AppUser {
    id: string;
    phone: string;
    fullName: string | null;
    isSuspended: boolean;
    createdAt: string;
  }

  let users: AppUser[] = [];
  let loading = true;
  let error = '';

  const columns = [
    { key: 'phone', label: 'Phone', sortable: true },
    { key: 'fullName', label: 'Name' },
    { key: 'isSuspended', label: 'Status' },
    { key: 'createdAt', label: 'Joined', sortable: true },
    { key: 'actions', label: '' },
  ];

  async function load() {
    loading = true;
    try {
      const res = await api.get<{ users: AppUser[] }>('/admin/users?limit=100');
      users = res.users;
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function toggleSuspend(user: AppUser) {
    error = '';
    try {
      await api.patch(`/admin/users/${user.id}/suspend`, { suspended: !user.isSuspended });
      users = users.map((u) => (u.id === user.id ? { ...u, isSuspended: !u.isSuspended } : u));
    } catch (err) {
      error = err instanceof ApiError ? 'Could not update user.' : 'Network error.';
    }
  }
</script>

<h1>Users</h1>

{#if error}
  <p class="error">{error}</p>
{/if}

{#if loading}
  <p class="hint">Loading…</p>
{:else}
  <DataTable {columns} rows={users} emptyMessage="No users yet.">
    <svelte:fragment slot="cell" let:row let:column>
      {#if column === 'fullName'}
        {row.fullName ?? '—'}
      {:else if column === 'isSuspended'}
        <span class="status" class:suspended={row.isSuspended}>
          {row.isSuspended ? 'Suspended' : 'Active'}
        </span>
      {:else if column === 'createdAt'}
        {new Date(row.createdAt).toLocaleDateString()}
      {:else if column === 'actions'}
        <button class="toggle" on:click={() => toggleSuspend(row)}>
          {row.isSuspended ? 'Unsuspend' : 'Suspend'}
        </button>
      {:else}
        {(row as unknown as Record<string, unknown>)[column]}
      {/if}
    </svelte:fragment>
  </DataTable>
{/if}

<style>
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: var(--space-20);
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .error {
    color: var(--color-danger);
    font-size: 13px;
    margin-bottom: var(--space-12);
  }

  .status {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-success);
  }

  .status.suspended {
    color: var(--color-danger);
  }

  .toggle {
    border: 1px solid var(--color-border);
    background: var(--color-card-bg);
    color: var(--color-text-primary);
    font-size: 12px;
    font-weight: 600;
    padding: var(--space-4) var(--space-12);
    border-radius: var(--radius-button);
    cursor: pointer;
  }
</style>
