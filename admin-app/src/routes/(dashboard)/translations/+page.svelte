<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { toast } from '$lib/stores/toast.store.js';
  import { ArrowLeft, Check, ChevronDown, Loader2, RefreshCw, Search } from 'lucide-svelte';

  interface I18nRow {
    locale: 'en' | 'am';
    key: string;
    value: string;
    updatedAt: string;
    updatedBy: string | null;
  }

  let locale: 'en' | 'am' = 'en';
  let rows: I18nRow[] = [];
  let loading = true;
  let loadError = false;
  let search = '';
  let status: Record<string, 'saving' | 'saved' | 'error' | undefined> = {};
  let saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

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
      const res = await api.get<{ strings: I18nRow[] }>(`/admin/translations/${locale}`);
      rows = res.strings;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  // Explicit function on tab click, not a `$: locale, load()` reactive
  // statement — that would fire a second time at component init (Svelte
  // reactive statements run once synchronously before onMount), doubling
  // the very first fetch.
  function switchLocale(next: 'en' | 'am') {
    if (next === locale || loading) return;
    locale = next;
    load();
  }

  async function save(row: I18nRow) {
    status = { ...status, [row.key]: 'saving' };
    try {
      await api.patch(`/admin/translations/${locale}`, { key: row.key, value: row.value });
      status = { ...status, [row.key]: 'saved' };
      setTimeout(() => {
        if (status[row.key] === 'saved') status = { ...status, [row.key]: undefined };
      }, 1500);
    } catch (err) {
      status = { ...status, [row.key]: 'error' };
      toast.error(apiErrorMessage(err, `Could not save "${row.key}".`), 'Save Failed');
    }
  }

  // Debounced per-key so fast typing sends one request after a pause, not
  // one per keystroke — 370+ fields makes that the only reasonable option.
  function onEdit(row: I18nRow, value: string) {
    row.value = value;
    rows = rows;
    status = { ...status, [row.key]: undefined };
    clearTimeout(saveTimers[row.key]);
    saveTimers[row.key] = setTimeout(() => save(row), 600);
  }

  $: query = search.trim().toLowerCase();
  $: filtered = query
    ? rows.filter((row) => row.key.toLowerCase().includes(query) || row.value.toLowerCase().includes(query))
    : rows;
  // One top-level JSON segment ("numbers.continue" -> "numbers") per
  // section — matches the same nesting the mobile app's en.json/am.json
  // already use, so this page reads as "the same file, editable" rather
  // than an unfamiliar flat list.
  $: groups = (() => {
    const map = new Map<string, I18nRow[]>();
    for (const row of filtered) {
      const namespace = row.key.split('.')[0];
      (map.get(namespace) ?? map.set(namespace, []).get(namespace)!).push(row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();
</script>

<svelte:head><title>Translations · 251 Lottery Admin</title></svelte:head>

<div class="admin-reveal flex flex-col gap-6">
  <div class="flex items-center gap-3">
    <a href="/" class="admin-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-ink no-underline shadow-card-light" aria-label="Back to control center">
      <ArrowLeft size={18} />
    </a>
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">Mobile app content</p>
      <h1 class="text-xl font-bold tracking-[-0.02em] text-ink">Translations</h1>
    </div>
  </div>
  <p class="max-w-2xl -mt-3 text-sm leading-6 text-muted">
    Every piece of text the mobile app shows, in English and Amharic. Edits save automatically a moment after you
    stop typing and reach the app on its next launch — no rebuild or redeploy needed.
  </p>

  <div class="flex flex-wrap items-center gap-3">
    <div class="flex rounded-button border border-border bg-card p-1">
      <button type="button" class="admin-press rounded-button px-4 py-2 text-xs font-bold {locale === 'en' ? 'bg-sidebar text-white' : 'text-muted'}" on:click={() => switchLocale('en')}>English</button>
      <button type="button" class="admin-press rounded-button px-4 py-2 text-xs font-bold {locale === 'am' ? 'bg-sidebar text-white' : 'text-muted'}" on:click={() => switchLocale('am')}>አማርኛ</button>
    </div>
    <label class="relative flex-1 min-w-[200px]">
      <Search size={15} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <input
        bind:value={search}
        placeholder="Search by key or text…"
        class="h-11 w-full rounded-button border border-border bg-bg pl-9 pr-3 text-sm text-ink focus:border-primary focus:outline-none"
      />
    </label>
  </div>

  {#if loading}
    <div class="space-y-3 rounded-card border border-border bg-card p-5">
      {#each Array(4) as _}<div class="h-14 animate-pulse rounded-button bg-bg"></div>{/each}
    </div>
  {:else if loadError}
    <section class="flex min-h-[200px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
      <p class="text-sm font-bold text-ink">Could not load translations.</p>
      <button type="button" class="admin-press mt-4 flex h-10 items-center gap-2 rounded-button bg-sidebar px-4 text-xs font-bold text-white" on:click={load}><RefreshCw size={14} /> Try again</button>
    </section>
  {:else if !rows.length}
    <section class="flex min-h-[200px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-card px-6 text-center">
      <p class="text-sm font-bold text-ink">No translations seeded yet.</p>
      <p class="mt-1 max-w-sm text-xs leading-5 text-muted">Run the one-time seed script (api/src/db/seed-i18n.ts) to load the app's current text in as a starting point.</p>
    </section>
  {:else}
    <div class="flex flex-col gap-3">
      {#each groups as [namespace, groupRows] (namespace)}
        <details class="group rounded-card border border-border bg-card" open={!!query}>
          <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
            <span class="text-sm font-bold capitalize text-ink">{namespace}</span>
            <span class="flex items-center gap-2 text-xs font-semibold text-faint">
              {groupRows.length} {groupRows.length === 1 ? 'string' : 'strings'}
              <ChevronDown size={16} class="transition-transform duration-150 group-open:rotate-180" />
            </span>
          </summary>
          <div class="flex flex-col gap-3 border-t border-border p-4">
            {#each groupRows as row (row.key)}
              <label class="flex flex-col gap-1.5">
                <span class="flex items-center gap-1.5 text-[11px] font-semibold text-faint">
                  {row.key}
                  {#if status[row.key] === 'saving'}<Loader2 size={12} class="animate-spin text-primary-dark" />
                  {:else if status[row.key] === 'saved'}<Check size={12} class="text-success" />
                  {:else if status[row.key] === 'error'}<span class="text-danger">save failed</span>{/if}
                </span>
                <textarea
                  value={row.value}
                  rows="2"
                  dir={locale === 'am' ? 'auto' : 'ltr'}
                  on:input={(e) => onEdit(row, e.currentTarget.value)}
                  class="rounded-button border border-border bg-bg px-3 py-2 text-sm leading-5 text-ink focus:border-primary focus:outline-none"
                ></textarea>
              </label>
            {/each}
          </div>
        </details>
      {/each}
    </div>
  {/if}
</div>
