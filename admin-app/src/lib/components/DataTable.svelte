<script lang="ts" generics="T">
  import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-svelte';

  export let columns: { key: string; label: string; sortable?: boolean }[];
  export let rows: T[];
  export let emptyMessage = 'No results.';

  let sortKey = '';
  let sortDir: 'asc' | 'desc' = 'asc';

  function toggleSort(key: string, sortable?: boolean) {
    if (!sortable) return;
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  $: sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey];
        const bv = (b as Record<string, unknown>)[sortKey];
        if (av === bv) return 0;
        const result = (av as never) > (bv as never) ? 1 : -1;
        return sortDir === 'asc' ? result : -result;
      })
    : rows;
</script>

<div class="overflow-auto rounded-card border border-border bg-card shadow-[0_18px_45px_-38px_rgba(23,32,30,0.35)]">
  <table class="w-full min-w-[760px] border-collapse text-sm">
    <thead class="bg-bg/70">
      <tr>
        {#each columns as col (col.key)}
          <th
            class="whitespace-nowrap border-b border-border px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.09em] text-muted {col.sortable
              ? 'cursor-pointer select-none'
              : ''}"
            on:click={() => toggleSort(col.key, col.sortable)}
          >
            <span class="inline-flex items-center gap-1.5">
              {col.label}
              {#if col.sortable && sortKey === col.key}
                {#if sortDir === 'asc'}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
              {:else if col.sortable}
                <ArrowUpDown size={11} class="text-faint" />
              {/if}
            </span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if sortedRows.length === 0}
        <tr>
          <td class="px-5 py-12 text-center text-sm text-faint" colspan={columns.length}>{emptyMessage}</td>
        </tr>
      {:else}
        {#each sortedRows as row, i ((row as { id?: unknown }).id ?? i)}
          <tr class="transition-colors duration-200 hover:bg-bg/70">
            {#each columns as col (col.key)}
              <td class="px-5 py-4 text-[13px] text-ink {i === sortedRows.length - 1 ? '' : 'border-b border-border'}">
                <slot name="cell" {row} column={col.key}>
                  {(row as Record<string, unknown>)[col.key]}
                </slot>
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
