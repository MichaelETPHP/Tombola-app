<script lang="ts" generics="T">
  /**
   * Generic sortable/filterable table. Columns are declared by the caller;
   * cell rendering is done via a named slot per row so callers stay in
   * control of formatting (badges, links, etc.) without this component
   * knowing about any particular domain. `T` is inferred from `rows`, so
   * the `row` value handed to the cell slot keeps the caller's concrete
   * row type instead of collapsing to `unknown` — column keys stay plain
   * strings (unconstrained `T` can't guarantee an index signature).
   */
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

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        {#each columns as col (col.key)}
          <th
            class:sortable={col.sortable}
            on:click={() => toggleSort(col.key, col.sortable)}
          >
            {col.label}
            {#if col.sortable && sortKey === col.key}
              <span class="sort-indicator">{sortDir === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if sortedRows.length === 0}
        <tr>
          <td class="empty" colspan={columns.length}>{emptyMessage}</td>
        </tr>
      {:else}
        {#each sortedRows as row, i ((row as { id?: unknown }).id ?? i)}
          <tr>
            {#each columns as col (col.key)}
              <td>
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

<style>
  .table-wrap {
    background: var(--color-card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th {
    text-align: left;
    padding: var(--space-12) var(--space-16);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
  }

  .sort-indicator {
    font-size: 9px;
    margin-left: 4px;
  }

  td {
    padding: var(--space-12) var(--space-16);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  tr:last-child td {
    border-bottom: none;
  }

  .empty {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--space-32);
  }
</style>
