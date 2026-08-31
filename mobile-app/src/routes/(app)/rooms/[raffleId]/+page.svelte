<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import IosSpinner from '$lib/components/IosSpinner.svelte';
  import { ChevronLeft, Lock, Send } from 'lucide-svelte';
  import type { RoomMessage } from '$lib/schemas/index.js';

  // Chat has its own refresh mechanism (polling) — the page-wide
  // pull-to-refresh gesture would just fight scrolling through history.
  getPullRefreshContext().set(null);

  const raffleId = $page.params.raffleId;
  const POLL_INTERVAL_MS = 3000;

  let messages: RoomMessage[] = [];
  let loading = true;
  let sending = false;
  let draft = '';
  let error = '';
  let notAMember = false;
  let readOnly = false;
  let listEl: HTMLDivElement;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  async function scrollToBottom() {
    await tick();
    listEl?.scrollTo({ top: listEl.scrollHeight });
  }

  async function loadInitial() {
    loading = true;
    try {
      const res = await api.get<{ messages: RoomMessage[] }>(`/raffles/${raffleId}/room/messages`);
      messages = res.messages;
      await scrollToBottom();
    } catch (err) {
      if (err instanceof ApiError && err.body.includes('ROOM_NOTAMEMBER')) {
        notAMember = true;
      } else {
        error = 'Could not load this room.';
      }
    } finally {
      loading = false;
    }
  }

  async function pollNewMessages() {
    if (notAMember || messages.length === 0) return;
    try {
      const lastId = messages[messages.length - 1].id;
      const res = await api.get<{ messages: RoomMessage[] }>(
        `/raffles/${raffleId}/room/messages?after=${lastId}`
      );
      if (res.messages.length > 0) {
        const wasAtBottom = listEl && listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
        messages = [...messages, ...res.messages];
        if (wasAtBottom) await scrollToBottom();
      }
    } catch {
      // Silent — a missed poll just gets picked up on the next tick, no
      // need to interrupt the user reading with a transient network blip.
    }
  }

  onMount(() => {
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
      const res = await api.post<{ message: RoomMessage }>(`/raffles/${raffleId}/room/messages`, { content });
      messages = [...messages, res.message];
      draft = '';
      hapticLight();
      await scrollToBottom();
    } catch (err) {
      if (err instanceof ApiError && err.body.includes('ROOM_READONLY')) {
        readOnly = true;
        error = "This raffle has ended — the room is now read-only.";
      } else if (err instanceof ApiError && err.body.includes('Links')) {
        error = "Links aren't allowed here — only text and emoji.";
      } else {
        error = 'Could not send that — try again.';
      }
    } finally {
      sending = false;
    }
  }

  function timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
</script>

<svelte:head><title>Room · Tombola</title></svelte:head>

<div class="flex min-h-[calc(100dvh-var(--safe-top,0px)-100px)] flex-col gap-4">
  <div class="flex items-center gap-3">
    <button
      type="button"
      aria-label="Back to rooms"
      on:click={() => {
        hapticLight();
        goto('/rooms');
      }}
      class="tappable pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-card-light"
    >
      <ChevronLeft size={20} />
    </button>
    <h1 class="min-w-0 truncate font-display text-lg font-semibold text-ink">Raffle room</h1>
  </div>

  {#if loading}
    <div class="flex flex-1 items-center justify-center py-16">
      <IosSpinner size={26} color="#00B589" />
    </div>
  {:else if notAMember}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-card bg-card p-8 text-center shadow-card-light">
      <Lock size={22} class="text-muted" />
      <p class="text-sm font-semibold text-ink">Buy a ticket to join</p>
      <p class="text-[13px] leading-relaxed text-muted">
        This room is only open to people who hold a ticket for this raffle.
      </p>
      <a
        href="/raffles/{raffleId}"
        class="tappable mt-1 text-[13px] font-semibold text-primary-dark underline underline-offset-2"
      >View the raffle</a>
    </div>
  {:else}
    <div bind:this={listEl} class="no-scrollbar flex-1 overflow-y-auto overscroll-y-contain">
      <div class="flex flex-col gap-2.5 pb-2">
        {#each messages as message (message.id)}
          <div class="flex {message.isMine ? 'justify-end' : 'justify-start'}">
            <div
              class="max-w-[78%] rounded-card px-3.5 py-2.5 {message.senderType === 'admin'
                ? 'bg-gold-bg text-ink'
                : message.isMine
                  ? 'bg-primary text-[#0d221c]'
                  : 'bg-card text-ink shadow-card-light'}"
            >
              {#if message.senderType === 'admin'}
                <p class="mb-0.5 text-[10px] font-extrabold uppercase tracking-wide text-gold">Tombola</p>
              {/if}
              <p class="whitespace-pre-wrap break-words text-[14px] leading-snug">{message.content}</p>
              <p class="mt-1 text-right text-[10px] opacity-60">{timeLabel(message.createdAt)}</p>
            </div>
          </div>
        {:else}
          <p class="py-10 text-center text-[13px] text-muted">No messages yet — say hi 👋</p>
        {/each}
      </div>
    </div>

    {#if error}<p class="text-center text-[12px] text-coral-start">{error}</p>{/if}

    {#if readOnly}
      <p class="flex items-center justify-center gap-1.5 rounded-button bg-bg-start py-3 text-[12px] font-semibold text-muted">
        <Lock size={13} /> This room is read-only now that the raffle has ended.
      </p>
    {:else}
      <form
        on:submit|preventDefault={send}
        class="sticky flex items-center gap-2 rounded-button bg-card p-2 shadow-card-light"
        style="bottom: calc(92px + var(--safe-bottom, 0px));"
      >
        <input
          type="text"
          bind:value={draft}
          maxlength="500"
          placeholder="Text or emoji only — no links"
          class="h-11 min-w-0 flex-1 rounded-button border-none bg-bg-start px-3.5 font-sans text-[14px] text-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          class="pressable tappable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-[#0d221c] disabled:opacity-40"
        >
          {#if sending}
            <IosSpinner size={16} color="#0d221c" />
          {:else}
            <Send size={17} />
          {/if}
        </button>
      </form>
    {/if}
  {/if}
</div>
