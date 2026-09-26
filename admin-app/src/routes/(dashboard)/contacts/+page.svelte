<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api, ApiError } from '$lib/api/client.js';
  import { toast } from '$lib/stores/toast.store.js';
  import { toEthiopianDate, toEthiopianDateTime } from '$lib/utils/ethiopianDate.js';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import {
    ChevronLeft, ChevronRight, CircleAlert, Clock, Contact, Copy, MailCheck, RefreshCw, Search, Send, Trash2, Upload,
    X, CheckSquare, Square, SquareMinus,
  } from 'lucide-svelte';

  interface ImportedContact {
    phone: string;
    name: string | null;
    importedAt: string;
    // null until this contact is included in a successful bulk send.
    lastSmsSentAt: string | null;
    // This one contact's own cooldown end time (10h after lastSmsSentAt),
    // or null once it's eligible again — computed fresh by the server on
    // every load, per contact, never a shared/global gate. A contact who
    // was never sent to, or whose own cooldown has already elapsed, has
    // this as null and is a completely normal send target.
    cooldownUntil: string | null;
    // Computed fresh by the server on every load — true once this number
    // belongs to a real registered account. A converted lead isn't
    // selectable for marketing SMS any more (see canSelect below).
    isRegistered: boolean;
  }

  const MAX_SMS_RECIPIENTS = 500; // mirrors the server-side cap in POST /admin/contacts/sms
  const PAGE_SIZE = 50; // one page = one send batch — see the Not-sent pagination below
  const COOLDOWN_HOURS = 10; // mirrors contacts.service.ts's COOLDOWN_HOURS

  // A ticking clock, not a one-time snapshot — every per-contact cooldown
  // reads off this, so all of them count down live and a contact flips
  // back to "Not sent" (see notSentContacts below) the instant its own
  // window closes, no reload needed. Plain text update every second, no
  // per-tick animation — that would be motion for motion's sake on a
  // number changing 3600 times an hour.
  let nowMs = Date.now();
  let clockInterval: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    clockInterval = setInterval(() => { nowMs = Date.now(); }, 1000);
  });
  onDestroy(() => { if (clockInterval) clearInterval(clockInterval); });

  // Plain functions, not $: reactive statements — Svelte's $: dependency
  // tracking only sees variable names textually referenced in a given
  // reactive statement itself, not ones used transitively inside a
  // function it calls. A plain function here still reads the live nowMs
  // on every call (it's just a normal closure), and every call site that
  // actually needs to re-run each tick names nowMs directly instead (see
  // notSentContacts/sentContacts/selectableOnPage below).
  function isOnCooldown(c: ImportedContact): boolean {
    return !!c.cooldownUntil && new Date(c.cooldownUntil).getTime() > nowMs;
  }
  function cooldownRemainingMs(c: ImportedContact): number {
    return c.cooldownUntil ? Math.max(0, new Date(c.cooldownUntil).getTime() - nowMs) : 0;
  }
  function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  function canSelect(c: ImportedContact): boolean {
    return !c.isRegistered && !isOnCooldown(c);
  }

  let contacts: ImportedContact[] = [];
  let loading = true;
  let loadError = false;
  let search = '';

  let fileInput: HTMLInputElement;
  let importing = false;

  // Selection
  let selectedPhones = new Set<string>();
  $: selectedCount = selectedPhones.size;

  // Bulk SMS
  let composingSms = false;
  let smsMessage = '';
  let sendingSms = false;
  $: selectedContacts = contacts.filter((c) => selectedPhones.has(c.phone));

  // Delete
  let confirmingDeleteSelection = false;
  let confirmingDeleteOne: ImportedContact | null = null;
  let deleting = false;

  function apiErrorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return 'Network error.';
    try {
      const body = JSON.parse(err.body) as { error?: string };
      return body.error || fallback;
    } catch {
      return fallback;
    }
  }

  // ── Filtering ──────────────────────────────────────────────────
  $: normalizedSearch = search.trim().toLowerCase();
  $: filteredContacts = contacts.filter((c) =>
    !normalizedSearch ||
    c.phone.toLowerCase().includes(normalizedSearch) ||
    (c.name ?? '').toLowerCase().includes(normalizedSearch)
  );

  // ── Sent / not-sent split ──────────────────────────────────────
  // nowMs is referenced directly in both statements (not just inside the
  // isOnCooldown call) so Svelte's $: dependency tracking actually picks
  // it up — it only looks at names textually present in the statement
  // itself, not ones used transitively inside a called function. Without
  // this, a contact's cooldown expiring wouldn't move it back to "Not
  // sent" until some unrelated state change happened to force a rerun.
  $: notSentContacts = filteredContacts.filter((c) => !(c.cooldownUntil && new Date(c.cooldownUntil).getTime() > nowMs));
  $: sentContacts = filteredContacts.filter((c) => !!(c.cooldownUntil && new Date(c.cooldownUntil).getTime() > nowMs));

  // ── Not-sent pagination ──────────────────────────────────────────
  // One page IS one send batch: 50 contacts at a time, so "select all"
  // at the top of a page selects exactly the next 50 to message — no
  // separate quick-select control needed on top of that. A search reset
  // jumps back to page 1 (a stale page number showing an unrelated slice
  // of the new filtered set would be confusing); moving/returning
  // contacts (a send completing, or a cooldown expiring) just clamps the
  // page back into range if it no longer exists, rather than jumping the
  // admin around while they're mid-review.
  let notSentPage = 1;
  $: search, (notSentPage = 1);
  $: notSentTotalPages = Math.max(1, Math.ceil(notSentContacts.length / PAGE_SIZE));
  $: if (notSentPage > notSentTotalPages) notSentPage = notSentTotalPages;
  $: pagedNotSentContacts = notSentContacts.slice((notSentPage - 1) * PAGE_SIZE, notSentPage * PAGE_SIZE);

  // "All"/"some" only ever considers this page's selectable (not
  // registered, not on cooldown) contacts — one of those has no checkbox
  // at all, so it must never count against "everything is selected."
  $: selectableOnPage = pagedNotSentContacts.filter((c) => !c.isRegistered && !(c.cooldownUntil && new Date(c.cooldownUntil).getTime() > nowMs));
  $: selectedOnPageCount = selectableOnPage.filter((c) => selectedPhones.has(c.phone)).length;
  $: allOnPageSelected = selectableOnPage.length > 0 && selectedOnPageCount === selectableOnPage.length;
  $: someOnPageSelected = selectedOnPageCount > 0 && !allOnPageSelected;

  function toggleSelectAllOnPage() {
    if (allOnPageSelected) selectableOnPage.forEach((c) => selectedPhones.delete(c.phone));
    else selectableOnPage.forEach((c) => selectedPhones.add(c.phone));
    selectedPhones = new Set(selectedPhones);
  }
  function toggleSelect(contact: ImportedContact) {
    if (!canSelect(contact)) return;
    selectedPhones.has(contact.phone) ? selectedPhones.delete(contact.phone) : selectedPhones.add(contact.phone);
    selectedPhones = new Set(selectedPhones);
  }
  function clearSelection() { selectedPhones = new Set(); }

  // ── Load ─────────────────────────────────────────────────────
  async function load() {
    loading = true; loadError = false;
    try {
      const res = await api.get<{ contacts: ImportedContact[] }>('/admin/contacts');
      contacts = res.contacts;
      clearSelection();
    } catch { loadError = true; }
    finally { loading = false; }
  }
  onMount(load);

  // ── Import ───────────────────────────────────────────────────
  function triggerFilePicker() { fileInput?.click(); }

  async function onFileChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be re-selected later if needed
    if (!file) return;
    importing = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.upload<{ imported: number; skippedDuplicates: number; skippedInvalid: number; totalContacts: number }>(
        '/admin/contacts/import', formData
      );
      const extra = [
        result.skippedDuplicates ? `${result.skippedDuplicates} already saved` : '',
        result.skippedInvalid ? `${result.skippedInvalid} had an invalid number` : '',
      ].filter(Boolean).join(', ');
      toast.success(`${result.imported} contact${result.imported !== 1 ? 's' : ''} added${extra ? ` (${extra})` : ''}.`, 'Contacts Imported');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not import this CSV.'), 'Import Failed');
    } finally {
      importing = false;
    }
  }

  // ── Bulk SMS ─────────────────────────────────────────────────
  function closeCompose() { composingSms = false; smsMessage = ''; }

  async function sendBulkSmsToSelection() {
    const phones = [...selectedPhones];
    if (phones.length === 0 || phones.length > MAX_SMS_RECIPIENTS || !smsMessage.trim()) return;
    sendingSms = true;
    try {
      const result = await api.post<{ requested: number; sentCount: number; failedCount: number; excludedRegistered: number; excludedOnCooldown: number }>(
        '/admin/contacts/sms',
        { phones, message: smsMessage.trim() }
      );
      // excludedRegistered/excludedOnCooldown should normally both be 0 —
      // the page already hides the checkbox for either case — but the
      // server re-checks independently (someone could register, or a
      // previous send's cooldown could still be active, between page load
      // and send), so both are surfaced here rather than silently swallowed.
      const excludedParts = [
        result.excludedRegistered > 0 ? `${result.excludedRegistered} already registered` : '',
        result.excludedOnCooldown > 0 ? `${result.excludedOnCooldown} still on cooldown` : '',
      ].filter(Boolean);
      const excludedNote = excludedParts.length ? ` (${excludedParts.join(', ')} — skipped)` : '';
      if (result.failedCount === 0) {
        toast.success(`Sent to ${result.sentCount} contact${result.sentCount !== 1 ? 's' : ''}.${excludedNote}`, 'SMS Sent');
      } else {
        toast.error(`${result.sentCount} sent, ${result.failedCount} failed out of ${result.requested}.${excludedNote}`, 'SMS Partially Sent');
      }
      const sentAt = new Date().toISOString();
      const cooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const sentSet = new Set(phones);
      contacts = contacts.map((c) => (sentSet.has(c.phone) ? { ...c, lastSmsSentAt: sentAt, cooldownUntil } : c));
      clearSelection();
      closeCompose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'SMS send failed.'), 'Send Failed');
    } finally {
      sendingSms = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  async function deleteOne() {
    if (!confirmingDeleteOne || deleting) return;
    const target = confirmingDeleteOne;
    deleting = true;
    try {
      await api.delete('/admin/contacts', { phones: [target.phone] });
      contacts = contacts.filter((c) => c.phone !== target.phone);
      selectedPhones.delete(target.phone);
      selectedPhones = new Set(selectedPhones);
      toast.success(`${target.phone} removed.`, 'Contact Deleted');
      confirmingDeleteOne = null;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Delete failed.'), 'Delete Failed');
    } finally {
      deleting = false;
    }
  }

  async function deleteSelection() {
    const phones = [...selectedPhones];
    if (phones.length === 0 || deleting) return;
    deleting = true;
    try {
      await api.delete('/admin/contacts', { phones });
      contacts = contacts.filter((c) => !selectedPhones.has(c.phone));
      toast.success(`${phones.length} contact${phones.length !== 1 ? 's' : ''} removed.`, 'Contacts Deleted');
      clearSelection();
      confirmingDeleteSelection = false;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bulk delete failed.'), 'Delete Failed');
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head><title>Imported Contacts · Admin</title></svelte:head>

<div class="flex flex-col gap-6">

  <!-- ── Header ─────────────────────────────────────────────────── -->
  <header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
    <div>
      <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark">
        <Contact size={14} /> Bulk SMS mailing list
      </div>
      <h1 class="text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink md:text-[34px]">Imported contacts</h1>
      <p class="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">
        A CSV-imported phone list for bulk SMS — not registered platform accounts. Import once, message anytime.
      </p>
    </div>
    <div class="flex items-center gap-3">
      <div class="flex items-center rounded-button border border-border bg-card px-4 py-2.5">
        <span class="font-mono text-base font-bold text-ink">{contacts.length}</span>
        <span class="ml-2 text-[10px] text-muted">Total</span>
      </div>
      <input bind:this={fileInput} type="file" accept=".csv,text/csv" class="hidden" on:change={onFileChosen} />
      <button type="button"
        class="admin-press inline-flex h-11 items-center gap-2 rounded-button bg-primary px-4 text-xs font-bold text-white disabled:opacity-50"
        disabled={importing}
        on:click={triggerFilePicker}>
        {#if importing}<span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span> Importing…{:else}<Upload size={15} /> Import CSV{/if}
      </button>
    </div>
  </header>

  <p class="text-[11px] leading-4 text-faint">
    CSV must have a column named <strong class="text-ink">Phone</strong> (or Mobile/Number) — a <strong class="text-ink">Name</strong> column is optional. Every number is normalized to +251 format and never saved twice.
    <strong class="text-ink">Only Ethiopian (+251) numbers are accepted</strong> — any other country's number is automatically rejected as invalid, whatever format it's in.
  </p>

  <!-- ── Filters ────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <label class="relative block w-full sm:max-w-[360px]">
      <Search size={16} class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <span class="sr-only">Search contacts</span>
      <input bind:value={search} type="search" placeholder="Search by name or phone"
        class="h-11 w-full rounded-button border border-border bg-card pl-10 pr-4 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-primary" />
    </label>
    <button type="button"
      class="admin-press inline-flex h-9 items-center gap-1.5 self-start rounded-button border border-border bg-card px-3 text-[11px] font-bold text-muted hover:text-ink sm:self-auto"
      on:click={load} disabled={loading}>
      <RefreshCw size={13} class={loading ? 'animate-spin' : ''} /> Refresh
    </button>
  </div>

  <!-- ── Selection Banner ───────────────────────────────────────── -->
  {#if selectedCount > 0}
    <div class="flex items-center justify-between rounded-button border border-primary/20 bg-primary-bg px-4 py-2.5">
      <p class="text-[13px] font-semibold text-primary-dark">
        {selectedCount} of {selectableOnPage.length} contact{selectableOnPage.length !== 1 ? 's' : ''} selected on this page
      </p>
      <div class="flex items-center gap-2">
        {#if selectedCount < selectableOnPage.length}
          <button type="button"
            class="admin-press text-[11px] font-bold text-primary-dark underline underline-offset-2"
            on:click={toggleSelectAllOnPage}>
            Select all {selectableOnPage.length}
          </button>
          <span class="text-primary/40">·</span>
        {/if}
        <button type="button"
          class="admin-press inline-flex h-8 items-center gap-1.5 rounded-button border border-primary/25 bg-card px-3 text-[11px] font-bold text-primary-dark hover:bg-primary-bg"
          on:click={() => (composingSms = true)}>
          <Send size={12} /> Send SMS ({selectedCount})
        </button>
        <button type="button"
          class="admin-press inline-flex h-8 items-center gap-1.5 rounded-button border border-danger/25 bg-danger-bg px-3 text-[11px] font-bold text-danger hover:bg-danger hover:text-white"
          on:click={() => (confirmingDeleteSelection = true)}>
          <Trash2 size={12} /> Delete {selectedCount}
        </button>
        <button type="button" class="admin-press text-[11px] text-muted hover:text-ink" on:click={clearSelection}>
          <X size={14} />
        </button>
      </div>
    </div>
  {/if}

  <!-- ── Table ──────────────────────────────────────────────────── -->
  {#if loading}
    <div class="h-[420px] animate-pulse rounded-card bg-border"></div>
  {:else if loadError}
    <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-card border border-border bg-card p-8 text-center">
      <CircleAlert size={24} class="text-danger" />
      <div><p class="text-sm font-bold text-ink">Contacts could not be loaded</p><p class="mt-1 text-xs text-muted">Check the API connection and try again.</p></div>
      <button class="admin-press inline-flex h-10 items-center gap-2 rounded-button border border-border px-4 text-xs font-bold" on:click={load}><RefreshCw size={14} /> Try again</button>
    </div>
  {:else if contacts.length === 0}
    <div class="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-card p-8 text-center">
      <Contact size={26} class="text-faint" />
      <div><p class="text-sm font-bold text-ink">No contacts imported yet</p><p class="mt-1 max-w-xs text-xs text-muted">Import a CSV with a Phone column to build your bulk-SMS list.</p></div>
      <button type="button"
        class="admin-press inline-flex h-10 items-center gap-2 rounded-button bg-primary px-4 text-xs font-bold text-white"
        on:click={triggerFilePicker}>
        <Upload size={14} /> Import CSV
      </button>
    </div>
  {:else}
    <!-- ── Not sent ─────────────────────────────────────────────── -->
    <section class="flex flex-col gap-3">
      <h2 class="flex items-center gap-2 text-[13px] font-bold text-ink">
        <Square size={14} class="text-muted" /> Not sent
        <span class="rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold text-muted">{notSentContacts.length}</span>
      </h2>
      <div class="overflow-hidden rounded-card border border-border bg-card">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[600px] text-sm">
            <thead>
              <tr class="border-b border-border bg-bg text-left">
                <th class="w-12 px-4 py-3">
                  <button type="button"
                    aria-label={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    aria-checked={allOnPageSelected ? 'true' : someOnPageSelected ? 'mixed' : 'false'}
                    role="checkbox"
                    class="admin-press flex items-center justify-center text-muted hover:text-primary-dark"
                    on:click={toggleSelectAllOnPage}>
                    {#if allOnPageSelected}
                      <CheckSquare size={16} class="text-primary-dark" />
                    {:else if someOnPageSelected}
                      <SquareMinus size={16} class="text-primary-dark" />
                    {:else}
                      <Square size={16} />
                    {/if}
                  </button>
                </th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Phone</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Name</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Status</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Imported</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#if pagedNotSentContacts.length === 0}
                <tr><td colspan="6" class="px-4 py-12 text-center text-sm text-muted">{normalizedSearch ? 'No contacts match this search.' : 'Everyone imported has already been messaged.'}</td></tr>
              {:else}
                {#each pagedNotSentContacts as contact (contact.phone)}
                  {@const isSelected = selectedPhones.has(contact.phone)}
                  <tr class="transition-colors duration-100 {contact.isRegistered ? 'opacity-60' : ''} {isSelected ? 'bg-primary-bg/40' : 'hover:bg-bg'}">
                    <td class="px-4 py-3">
                      {#if canSelect(contact)}
                        <button type="button" aria-label={isSelected ? 'Deselect' : 'Select'}
                          class="admin-press flex items-center justify-center text-muted hover:text-primary-dark"
                          on:click={() => toggleSelect(contact)}>
                          {#if isSelected}<CheckSquare size={16} class="text-primary-dark" />{:else}<Square size={16} />{/if}
                        </button>
                      {:else}
                        <span class="flex items-center justify-center text-faint" title="Already a registered account — not selectable for marketing SMS">
                          <Square size={16} class="opacity-25" />
                        </span>
                      {/if}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                        <span>{contact.phone}</span>
                        <button
                          type="button"
                          class="admin-press text-faint hover:text-ink transition-colors"
                          title="Copy Phone"
                          on:click={() => { navigator.clipboard.writeText(contact.phone); toast.success(`Phone copied: ${contact.phone}`, 'Copied'); }}
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span class={contact.name ? 'font-semibold text-ink' : 'text-faint'}>{contact.name ?? 'Not provided'}</span>
                    </td>
                    <td class="px-4 py-3">
                      <StatusBadge status={contact.isRegistered ? 'registered' : 'lead'} />
                    </td>
                    <td class="px-4 py-3 text-xs text-muted">
                      <p class="font-medium text-ink">{toEthiopianDate(contact.importedAt)}</p>
                      <p class="mt-1 text-[10px] text-faint">{new Date(contact.importedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td class="px-4 py-3">
                      <button type="button" aria-label="Delete"
                        class="admin-press inline-flex h-8 w-8 items-center justify-center rounded-button border border-danger/20 bg-danger-bg text-danger hover:bg-danger hover:text-white disabled:opacity-50 transition-colors"
                        disabled={deleting}
                        on:click={() => (confirmingDeleteOne = contact)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
        {#if notSentContacts.length > 0}
          <div class="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-[11px] text-faint">
              Batch {notSentPage} of {notSentTotalPages} · {pagedNotSentContacts.length} of {notSentContacts.length} contact{notSentContacts.length !== 1 ? 's' : ''} shown
              {#if selectedCount > 0}<span class="ml-2 font-bold text-primary-dark">· {selectedCount} selected</span>{/if}
            </p>
            {#if notSentTotalPages > 1}
              <nav aria-label="Not-sent contact batches" class="flex items-center gap-3 self-end sm:self-auto">
                <button type="button"
                  class="admin-press flex h-8 w-8 items-center justify-center rounded-button border border-border text-ink disabled:opacity-40"
                  disabled={notSentPage === 1}
                  aria-label="Previous batch"
                  on:click={() => (notSentPage -= 1)}>
                  <ChevronLeft size={15} />
                </button>
                <span class="text-[11px] font-bold text-ink">{notSentPage} / {notSentTotalPages}</span>
                <button type="button"
                  class="admin-press flex h-8 w-8 items-center justify-center rounded-button border border-border text-ink disabled:opacity-40"
                  disabled={notSentPage === notSentTotalPages}
                  aria-label="Next batch"
                  on:click={() => (notSentPage += 1)}>
                  <ChevronRight size={15} />
                </button>
              </nav>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- ── Sent ─────────────────────────────────────────────────── -->
    <section class="flex flex-col gap-3">
      <h2 class="flex items-center gap-2 text-[13px] font-bold text-ink">
        <MailCheck size={14} class="text-success" /> Sent
        <span class="rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold text-muted">{sentContacts.length}</span>
      </h2>
      <div class="overflow-hidden rounded-card border border-border bg-card">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-border bg-bg text-left">
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Phone</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Name</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Sent</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Next available</th>
                <th class="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#if sentContacts.length === 0}
                <tr><td colspan="5" class="px-4 py-12 text-center text-sm text-muted">{normalizedSearch ? 'No contacts match this search.' : 'No bulk SMS has gone out yet.'}</td></tr>
              {:else}
                {#each sentContacts as contact (contact.phone)}
                  <tr class="transition-colors duration-100 hover:bg-bg">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                        <span>{contact.phone}</span>
                        <button
                          type="button"
                          class="admin-press text-faint hover:text-ink transition-colors"
                          title="Copy Phone"
                          on:click={() => { navigator.clipboard.writeText(contact.phone); toast.success(`Phone copied: ${contact.phone}`, 'Copied'); }}
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span class={contact.name ? 'font-semibold text-ink' : 'text-faint'}>{contact.name ?? 'Not provided'}</span>
                    </td>
                    <td class="px-4 py-3 text-xs text-muted">
                      <p class="font-medium text-ink">{toEthiopianDateTime(contact.lastSmsSentAt ?? contact.importedAt)}</p>
                    </td>
                    <td class="px-4 py-3">
                      <!-- Each row reads its own cooldownUntil — this contact's
                           own countdown, independent of every other row's. -->
                      <span class="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2.5 py-1 font-mono text-[11px] font-bold text-danger">
                        <Clock size={11} /> {formatCountdown(cooldownRemainingMs(contact))}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <button type="button" aria-label="Delete"
                        class="admin-press inline-flex h-8 w-8 items-center justify-center rounded-button border border-danger/20 bg-danger-bg text-danger hover:bg-danger hover:text-white disabled:opacity-50 transition-colors"
                        disabled={deleting}
                        on:click={() => (confirmingDeleteOne = contact)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  {/if}
</div>

<!-- ── Compose SMS Modal ──────────────────────────────────────────── -->
{#if composingSms}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4">
    <div class="admin-reveal w-full max-w-[440px] rounded-card border border-border bg-card p-6 shadow-2xl">
      <h2 class="text-base font-bold text-ink">Send SMS to {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''}</h2>
      <p class="mt-1.5 text-sm text-muted">This goes out immediately to every phone number below.</p>

      {#if selectedContacts.length > MAX_SMS_RECIPIENTS}
        <div class="mt-4 flex items-center gap-2 rounded-button border border-danger/20 bg-danger-bg px-3 py-2.5 text-xs font-semibold text-danger">
          <CircleAlert size={14} /> Too many recipients — maximum {MAX_SMS_RECIPIENTS} per send. Narrow your selection.
        </div>
      {/if}

      <div class="mt-4 max-h-[140px] overflow-y-auto rounded-button border border-border bg-bg p-2">
        <ul class="flex flex-wrap gap-1.5">
          {#each selectedContacts as contact (contact.phone)}
            <li class="rounded-[6px] border border-border bg-card px-2 py-1 font-mono text-[11px] text-ink">
              {contact.phone}{#if contact.name}<span class="text-faint"> · {contact.name}</span>{/if}
            </li>
          {/each}
        </ul>
      </div>

      <label class="mt-4 block">
        <span class="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Message</span>
        <textarea bind:value={smsMessage} rows="4" maxlength="1000" placeholder="Type your message…"
          class="w-full resize-none rounded-button border border-border bg-card p-3 text-sm text-ink outline-none focus:border-primary"
        ></textarea>
        <span class="mt-1 block text-right text-[10px] text-faint">{smsMessage.length}/1000</span>
      </label>

      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="admin-press h-10 rounded-button border border-border px-5 text-xs font-bold text-ink" disabled={sendingSms} on:click={closeCompose}>Cancel</button>
        <button type="button"
          class="admin-press inline-flex h-10 items-center gap-1.5 rounded-button bg-primary px-5 text-xs font-bold text-white disabled:opacity-50"
          disabled={sendingSms || !smsMessage.trim() || selectedContacts.length === 0 || selectedContacts.length > MAX_SMS_RECIPIENTS}
          on:click={sendBulkSmsToSelection}>
          {#if sendingSms}<span class="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span> Sending…{:else}<Send size={13} /> Send{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Delete-One Confirm ─────────────────────────────────────────── -->
{#if confirmingDeleteOne}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4">
    <div class="admin-reveal w-full max-w-[380px] rounded-card border border-border bg-card p-6 shadow-2xl">
      <h2 class="text-base font-bold text-ink">Remove this contact?</h2>
      <p class="mt-1.5 text-sm text-muted">{confirmingDeleteOne.phone} will be removed from the bulk-SMS list. This doesn't affect any platform account.</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="admin-press h-10 rounded-button border border-border px-5 text-xs font-bold text-ink" disabled={deleting} on:click={() => (confirmingDeleteOne = null)}>Cancel</button>
        <button type="button"
          class="admin-press inline-flex h-10 items-center gap-1.5 rounded-button bg-danger px-5 text-xs font-bold text-white disabled:opacity-50"
          disabled={deleting}
          on:click={deleteOne}>
          {#if deleting}<span class="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span> Removing…{:else}<Trash2 size={13} /> Remove{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Bulk Delete Confirm ────────────────────────────────────────── -->
{#if confirmingDeleteSelection}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4">
    <div class="admin-reveal w-full max-w-[380px] rounded-card border border-border bg-card p-6 shadow-2xl">
      <h2 class="text-base font-bold text-ink">Remove {selectedCount} contact{selectedCount !== 1 ? 's' : ''}?</h2>
      <p class="mt-1.5 text-sm text-muted">These numbers will be removed from the bulk-SMS list. This doesn't affect any platform account.</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="admin-press h-10 rounded-button border border-border px-5 text-xs font-bold text-ink" disabled={deleting} on:click={() => (confirmingDeleteSelection = false)}>Cancel</button>
        <button type="button"
          class="admin-press inline-flex h-10 items-center gap-1.5 rounded-button bg-danger px-5 text-xs font-bold text-white disabled:opacity-50"
          disabled={deleting}
          on:click={deleteSelection}>
          {#if deleting}<span class="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span> Removing…{:else}<Trash2 size={13} /> Remove{/if}
        </button>
      </div>
    </div>
  </div>
{/if}
