<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { toast } from '$lib/stores/toast.store.js';
  import DataTable from '$lib/components/DataTable.svelte';
  import { ArrowLeft, CheckSquare, Plus, RefreshCw, Square } from 'lucide-svelte';

  interface DeliveryMethod {
    id: string;
    label: string;
    requiresDetails: boolean;
    detailsLabel: string | null;
    sortOrder: number;
    isActive: boolean;
  }

  let methods: DeliveryMethod[] = [];
  let loading = true;
  let loadError = false;
  let togglingId: string | null = null;

  let newLabel = '';
  let newRequiresDetails = true;
  let newDetailsLabel = '';
  let adding = false;

  const columns = [
    { key: 'label', label: 'Method' },
    { key: 'details', label: 'Asks for' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
  ];

  function apiErrorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return 'Network error.';
    try {
      const body = JSON.parse(err.body) as { error?: string };
      return body.error || fallback;
    } catch {
      return fallback;
    }
  }

  async function load() {
    loading = true;
    loadError = false;
    try {
      const res = await api.get<{ methods: DeliveryMethod[] }>('/admin/payouts/delivery-methods');
      methods = res.methods;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function addMethod() {
    if (!newLabel.trim() || adding) return;
    adding = true;
    try {
      await api.post('/admin/payouts/delivery-methods', {
        label: newLabel.trim(),
        requiresDetails: newRequiresDetails,
        detailsLabel: newRequiresDetails ? newDetailsLabel.trim() || null : null,
        sortOrder: methods.length,
      });
      toast.success(`"${newLabel.trim()}" added.`, 'Delivery Methods');
      newLabel = '';
      newDetailsLabel = '';
      newRequiresDetails = true;
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not add this method.'), 'Add Failed');
    } finally {
      adding = false;
    }
  }

  async function toggleActive(method: DeliveryMethod) {
    if (togglingId) return;
    togglingId = method.id;
    try {
      await api.patch(`/admin/payouts/delivery-methods/${method.id}`, { isActive: !method.isActive });
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update this method.'), 'Update Failed');
    } finally {
      togglingId = null;
    }
  }
</script>

<svelte:head><title>Delivery methods · 251 Lottery Admin</title></svelte:head>

<div class="admin-reveal flex flex-col gap-6">
  <div class="flex items-center gap-3">
    <a href="/payouts" class="admin-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-ink no-underline shadow-card-light" aria-label="Back to payouts">
      <ArrowLeft size={18} />
    </a>
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">Prize fulfillment</p>
      <h1 class="text-xl font-bold tracking-[-0.02em] text-ink">Delivery methods</h1>
    </div>
  </div>
  <p class="max-w-2xl -mt-3 text-sm leading-6 text-muted">
    The options a winner can choose from when claiming a prize. Deactivate a method that's no longer offered instead
    of deleting it — winners who already claimed under it keep an accurate record.
  </p>

  <section class="rounded-card border border-border bg-card p-5">
    <h2 class="mb-4 text-sm font-bold text-ink">Add a method</h2>
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label class="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">Label
        <input bind:value={newLabel} maxlength="100" placeholder="e.g. Telebirr transfer" class="h-11 rounded-button border border-border bg-bg px-3 text-sm font-medium normal-case tracking-normal text-ink focus:border-primary focus:outline-none" />
      </label>
      <label class="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">Details field label (optional)
        <input bind:value={newDetailsLabel} disabled={!newRequiresDetails} maxlength="100" placeholder="e.g. Bank account number" class="h-11 rounded-button border border-border bg-bg px-3 text-sm font-medium normal-case tracking-normal text-ink focus:border-primary focus:outline-none disabled:opacity-50" />
      </label>
      <button type="button" class="admin-press flex h-11 shrink-0 items-center gap-2 rounded-button px-3 text-xs font-bold {newRequiresDetails ? 'bg-primary-bg text-primary-dark' : 'bg-bg text-muted'}" on:click={() => (newRequiresDetails = !newRequiresDetails)}>
        {#if newRequiresDetails}<CheckSquare size={15} />{:else}<Square size={15} />{/if} Needs details
      </button>
      <button type="button" disabled={!newLabel.trim() || adding} class="admin-press flex h-11 shrink-0 items-center justify-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" on:click={addMethod}>
        <Plus size={15} /> {adding ? 'Adding…' : 'Add method'}
      </button>
    </div>
  </section>

  {#if loading}
    <div class="space-y-3 rounded-card border border-border bg-card p-5">
      {#each Array(3) as _}<div class="h-14 animate-pulse rounded-button bg-bg"></div>{/each}
    </div>
  {:else if loadError}
    <section class="flex min-h-[200px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
      <p class="text-sm font-bold text-ink">Could not load delivery methods.</p>
      <button type="button" class="admin-press mt-4 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={load}><RefreshCw size={14} /> Try again</button>
    </section>
  {:else}
    <DataTable {columns} rows={methods} emptyMessage="No delivery methods yet.">
      <svelte:fragment slot="cell" let:row let:column>
        {#if column === 'label'}
          <span class="font-bold text-ink">{row.label}</span>
        {:else if column === 'details'}
          <span class="text-muted">{row.requiresDetails ? (row.detailsLabel || 'A details field') : 'Nothing extra'}</span>
        {:else if column === 'status'}
          <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold {row.isActive ? 'bg-success-bg text-success' : 'bg-border text-muted'}">
            {row.isActive ? 'Active' : 'Inactive'}
          </span>
        {:else if column === 'actions'}
          <button
            type="button"
            disabled={togglingId === row.id}
            class="admin-press flex h-9 items-center gap-2 rounded-button border border-border bg-card px-3 text-xs font-bold text-ink disabled:opacity-60"
            on:click={() => toggleActive(row)}
          >
            {row.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        {/if}
      </svelte:fragment>
    </DataTable>
  {/if}
</div>
