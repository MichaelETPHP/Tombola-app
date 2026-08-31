<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import type { RoomMessage, Raffle } from '$lib/schemas/index.js';
  import { ArrowLeft, History, Send, ShieldCheck } from 'lucide-svelte';

  const raffleId = $page.params.id;
  const POLL_INTERVAL_MS = 3000;
  // Trigger the next history page a little before the physical top, so it
  // resolves before the admin's eye actually reaches the edge — waiting
  // for scrollTop === 0 exactly reads as a stutter, not a load.
  const LOAD_OLDER_THRESHOLD_PX = 80;

  let raffle: Raffle | null = null;
  let messages: RoomMessage[] = [];
  let loading = true;
  let loadingOlder = false;
  let hasMore = false;
  let sending = false;
  let draft = '';
  let error = '';
  let listEl: HTMLDivElement;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  async function scrollToBottom() {
    await tick();
    listEl?.scrollTo({ top: listEl.scrollHeight });
  }

  async function loadRaffle() {
    try {
      const res = await api.get<{ raffle: Raffle }>(`/admin/raffles/${raffleId}`);
      raffle = res.raffle;
    } catch {
      // Non-fatal — the room still works without the title, just shows generically.
    }
  }

  async function loadInitial() {
    loading = true;
    try {
      const res = await api.get<{ messages: RoomMessage[]; hasMore: boolean }>(
        `/admin/raffles/${raffleId}/room/messages`
      );
      messages = res.messages;
      hasMore = res.hasMore;
      await scrollToBottom();
    } catch {
      error = 'Could not load this room.';
    } finally {
      loading = false;
    }
  }

  /**
   * Scrolling up to reveal older history must never make the admin lose
   * their place — prepending content above an anchored scroll position
   * pushes everything down by exactly the height of what was added, so
   * restoring `scrollTop` by that same delta keeps whatever message they
   * were reading pinned under their eye instead of the view jumping.
   */
  async function loadOlder() {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    loadingOlder = true;
    try {
      const oldestId = messages[0].id;
      const res = await api.get<{ messages: RoomMessage[]; hasMore: boolean }>(
        `/admin/raffles/${raffleId}/room/messages?before=${oldestId}`
      );
      if (res.messages.length > 0) {
        const heightBefore = listEl.scrollHeight;
        messages = [...res.messages, ...messages];
        await tick();
        listEl.scrollTop = listEl.scrollHeight - heightBefore;
      }
      hasMore = res.hasMore;
    } catch {
      // Leave hasMore as-is — the next scroll-up attempt just retries.
    } finally {
      loadingOlder = false;
    }
  }

  function handleScroll() {
    if (listEl.scrollTop < LOAD_OLDER_THRESHOLD_PX) loadOlder();
  }

  async function pollNewMessages() {
    if (messages.length === 0) return;
    try {
      const lastId = messages[messages.length - 1].id;
      const res = await api.get<{ messages: RoomMessage[] }>(
        `/admin/raffles/${raffleId}/room/messages?after=${lastId}`
      );
      if (res.messages.length > 0) {
        const wasAtBottom = listEl && listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
        messages = [...messages, ...res.messages];
        if (wasAtBottom) await scrollToBottom();
      }
    } catch {
      // Silent — picked up on the next poll.
    }
  }

  onMount(() => {
    loadRaffle();
    loadInitial().then(() => {
      if (!cancelled) pollTimer = setInterval(pollNewMessages, POLL_INTERVAL_MS);
    });
  });

  onDestroy(() => {
    cancelled = true;
    clearInterval(pollTimer);
  });

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    error = '';
    sending = true;
    try {
      const res = await api.post<{ message: RoomMessage }>(`/admin/raffles/${raffleId}/room/messages`, { content });
      messages = [...messages, res.message];
      draft = '';
      await scrollToBottom();
    } catch (err) {
      error = err instanceof ApiError ? 'Could not send that message.' : 'Network error.';
    } finally {
      sending = false;
    }
  }

  function timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
</script>

<svelte:head><title>Room · {raffle?.title ?? 'Raffle'} · Tombola Admin</title></svelte:head>

<div class="admin-reveal">
  <a href="/raffles/{raffleId}" class="mb-5 inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-ink"><ArrowLeft size={15} /> Back to raffle</a>
  <header class="mb-6">
    <p class="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Raffle room</p>
    <h1 class="text-[26px] font-bold tracking-[-0.03em] text-ink">{raffle?.title ?? 'Loading…'}</h1>
    <p class="mt-2 flex items-center gap-1.5 text-xs text-faint"><ShieldCheck size={14} class="text-primary" /> Only you can post links here — regular buyers are text/emoji only.</p>
  </header>

  {#if error}<p class="mb-4 rounded-button bg-danger-bg px-4 py-3 text-xs font-medium text-danger" role="alert">{error}</p>{/if}

  <div class="flex h-[60vh] flex-col rounded-card border border-border bg-card">
    <div bind:this={listEl} on:scroll={handleScroll} class="flex-1 space-y-3 overflow-y-auto p-5">
      {#if loading}
        <p class="text-xs text-faint">Loading…</p>
      {:else if messages.length === 0}
        <p class="text-xs text-faint">No messages yet.</p>
      {:else}
        {#if loadingOlder}
          <p class="py-1 text-center text-[11px] text-faint">Loading earlier messages…</p>
        {:else if !hasMore}
          <p class="flex items-center justify-center gap-1.5 py-1 text-center text-[11px] text-faint"><History size={12} /> Beginning of this room</p>
        {/if}
        {#each messages as message (message.id)}
          <div class="flex {message.senderType === 'admin' ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[70%] rounded-button px-3.5 py-2.5 {message.senderType === 'admin' ? 'bg-primary text-white' : 'bg-bg/70 text-ink'}">
              <p class="whitespace-pre-wrap break-words text-sm leading-snug">{message.content}</p>
              <p class="mt-1 text-right text-[10px] opacity-70">{timeLabel(message.createdAt)}</p>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <form on:submit|preventDefault={send} class="flex items-center gap-2 border-t border-border p-3">
      <input
        type="text"
        bind:value={draft}
        maxlength="500"
        placeholder="Post as Tombola — links allowed"
        class="h-11 min-w-0 flex-1 rounded-button border border-border bg-bg/55 px-3.5 text-sm text-ink focus:border-primary focus:bg-card focus:outline-none"
      />
      <button
        type="submit"
        disabled={!draft.trim() || sending}
        class="admin-press flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-primary text-white disabled:opacity-50"
        aria-label="Send"
      >
        <Send size={16} />
      </button>
    </form>
  </div>
</div>
