<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import DataTable from '$lib/components/DataTable.svelte';

  /**
   * NOTE: GET /admin/audit-log doesn't exist on the API yet — there's no
   * audit_log table/module (api/src/modules has no audit domain, unlike
   * users/raffles/tickets/payments/draws/payouts). This screen is wired up
   * and ready; add the table + query + route once schema.sql defines it.
   */
  interface AuditEntry {
    id: string;
    entityType: string;
    entityId: string;
    actorType: 'user' | 'admin' | 'system';
    actorId: string | null;
    action: string;
    createdAt: string;
  }

  let entries: AuditEntry[] = [];
  let entityTypeFilter = '';
  let actorTypeFilter = '';
  let loading = true;
  let unavailable = false;
  let page = 0;
  const pageSize = 25;

  const columns = [
    { key: 'createdAt', label: 'When', sortable: true },
    { key: 'actorType', label: 'Actor' },
    { key: 'action', label: 'Action' },
    { key: 'entityType', label: 'Entity' },
    { key: 'entityId', label: 'Entity ID' },
  ];

  async function load() {
    loading = true;
    unavailable = false;
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        ...(entityTypeFilter && { entityType: entityTypeFilter }),
        ...(actorTypeFilter && { actorType: actorTypeFilter }),
      });
      const res = await api.get<{ entries: AuditEntry[] }>(`/admin/audit-log?${params}`);
      entries = res.entries;
    } catch (err) {
      unavailable = err instanceof ApiError;
      entries = [];
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $: entityTypeFilter, actorTypeFilter, page, load();
</script>

<h1>Audit log</h1>

<div class="filters">
  <select bind:value={entityTypeFilter}>
    <option value="">All entities</option>
    <option value="raffle">Raffle</option>
    <option value="payout">Payout</option>
    <option value="user">User</option>
  </select>
  <select bind:value={actorTypeFilter}>
    <option value="">All actors</option>
    <option value="admin">Admin</option>
    <option value="user">User</option>
    <option value="system">System</option>
  </select>
</div>

{#if loading}
  <p class="hint">Loading…</p>
{:else if unavailable}
  <p class="hint">
    Audit log endpoint isn't available yet — this view will populate once
    <code>GET /admin/audit-log</code> is implemented on the API.
  </p>
{:else}
  <DataTable {columns} rows={entries} emptyMessage="No audit entries for this filter.">
    <svelte:fragment slot="cell" let:row let:column>
      {#if column === 'createdAt'}
        {new Date(row.createdAt).toLocaleString()}
      {:else}
        {(row as unknown as Record<string, unknown>)[column]}
      {/if}
    </svelte:fragment>
  </DataTable>

  <div class="pagination">
    <button disabled={page === 0} on:click={() => (page -= 1)}>Previous</button>
    <span>Page {page + 1}</span>
    <button disabled={entries.length < pageSize} on:click={() => (page += 1)}>Next</button>
  </div>
{/if}

<style>
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: var(--space-20);
  }

  .filters {
    display: flex;
    gap: var(--space-8);
    margin-bottom: var(--space-16);
  }

  select {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-button);
    padding: var(--space-8) var(--space-12);
    font-size: 13px;
    background: var(--color-card-bg);
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .hint code {
    font-family: monospace;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: var(--space-16);
    margin-top: var(--space-16);
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .pagination button {
    border: 1px solid var(--color-border);
    background: var(--color-card-bg);
    padding: var(--space-4) var(--space-12);
    border-radius: var(--radius-button);
    cursor: pointer;
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
