<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { cubicOut, backOut } from 'svelte/easing';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { dicebearAvatarUri } from '$lib/utils/avatar.js';
  import IosSpinner from '$lib/components/IosSpinner.svelte';
  import { ChevronLeft, Lock, Send, Ticket, Bell, BellOff, ChevronDown, Check } from 'lucide-svelte';
  import type { Raffle, RoomMessage } from '$lib/schemas/index.js';
  import { playChatSound, isChatSoundMuted, setChatSoundMuted } from '$lib/native/chatSound.js';
  import { markRoomSeen } from '$lib/stores/unreadRooms.js';

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
  let inputEl: HTMLInputElement;
  let bottomSentinel: HTMLDivElement;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;
  let soundMuted = false;
  let atBottom = true;
  let unreadCount = 0;
  let inputFocused = false;

  let roomTitle = '';
  let roomEnded = false;

  function toggleSound() {
    soundMuted = !soundMuted;
    hapticLight();
    setChatSoundMuted(soundMuted);
  }

  // A sentinel at the end of the list + scrollIntoView sidesteps the
  // long-standing html-vs-body "which element is really the document's
  // scroller" ambiguity entirely (document.scrollingElement disagreed with
  // where the page actually visibly scrolled to in testing here) — the
  // browser resolves the right scroll container on its own either way.
  async function scrollToBottom() {
    await tick();
    bottomSentinel?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    atBottom = true;
    unreadCount = 0;
  }

  function handleScroll() {
    if (!bottomSentinel) return;
    atBottom = bottomSentinel.getBoundingClientRect().bottom <= window.innerHeight + 80;
    if (atBottom) unreadCount = 0;
  }

  async function loadRoomMeta() {
    try {
      const res = await api.get<{ raffle: Raffle }>(`/raffles/${raffleId}`, { skipAuth: true });
      roomTitle = res.raffle.title;
      roomEnded = res.raffle.status === 'completed' || res.raffle.status === 'cancelled';
      if (roomEnded) readOnly = true;
    } catch {
      // Header just falls back to a generic label — not worth surfacing.
    }
  }

  async function loadInitial() {
    loading = true;
    try {
      const res = await api.get<{ messages: RoomMessage[] }>(`/raffles/${raffleId}/room/messages`);
      messages = res.messages;
      // Opening the room means everything in it is now "seen" — clears
      // this room's contribution to the Profile tab's unread badge.
      const last = messages[messages.length - 1];
      if (last) markRoomSeen(raffleId, last.createdAt);
      // Flip loading off BEFORE scrolling — the message list (and its
      // bottom sentinel) doesn't exist in the DOM until this renders past
      // the loading-skeleton branch, so scrolling first was a no-op.
      loading = false;
      await scrollToBottom();
    } catch (err) {
      loading = false;
      if (err instanceof ApiError && err.body.includes('ROOM_NOTAMEMBER')) {
        notAMember = true;
      } else {
        error = 'Could not load this room.';
      }
    }
  }

  async function pollNewMessages() {
    if (notAMember) return;
    try {
      // A room with nothing in it yet has no lastId to page from — falling
      // back to the plain (unfiltered) endpoint means the very first
      // message anyone sends still gets picked up on the next tick instead
      // of silently requiring a manual reload forever.
      const lastId = messages.length > 0 ? messages[messages.length - 1].id : undefined;
      const url = lastId
        ? `/raffles/${raffleId}/room/messages?after=${lastId}`
        : `/raffles/${raffleId}/room/messages`;
      const res = await api.get<{ messages: RoomMessage[] }>(url);
      if (res.messages.length > 0) {
        messages = [...messages, ...res.messages];
        // Still actively viewing this room — stays "seen" regardless of
        // who sent it, so the global poller never re-flags it later.
        markRoomSeen(raffleId, res.messages[res.messages.length - 1].createdAt);
        if (res.messages.some((m) => !m.isMine)) playChatSound();
        if (atBottom) {
          await scrollToBottom();
        } else {
          unreadCount += res.messages.filter((m) => !m.isMine).length;
        }
      }
    } catch {
      // Silent — a missed poll just gets picked up on the next tick, no
      // need to interrupt the user reading with a transient network blip.
    }
  }

  onMount(() => {
    soundMuted = isChatSoundMuted();
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    loadRoomMeta();
    loadInitial().then(() => {
      if (!cancelled) pollTimer = setInterval(pollNewMessages, POLL_INTERVAL_MS);
    });
  });

  onDestroy(() => {
    cancelled = true;
    clearInterval(pollTimer);
    document.removeEventListener('scroll', handleScroll, true);
  });

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    error = '';
    sending = true;
    try {
      const res = await api.post<{ message: RoomMessage }>(`/raffles/${raffleId}/room/messages`, { content });
      messages = [...messages, res.message];
      markRoomSeen(raffleId, res.message.createdAt);
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

  function sameDay(a: Date, b: Date): boolean {
    return a.toDateString() === b.toDateString();
  }

  function dateLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  }

  function isNewDay(i: number): boolean {
    if (i === 0) return true;
    return !sameDay(new Date(messages[i - 1].createdAt), new Date(messages[i].createdAt));
  }

  /** Messages from the same sender, sent back-to-back, group under one
   *  name/avatar header instead of repeating it on every bubble — the
   *  same collapsing every real group chat (Telegram, WhatsApp) does. */
  function senderKey(m: RoomMessage): string {
    if (m.isMine) return 'mine';
    if (m.senderType === 'admin') return 'admin';
    return m.senderAvatarSeed ?? 'unknown';
  }

  function isGroupStart(i: number): boolean {
    return isNewDay(i) || senderKey(messages[i - 1]) !== senderKey(messages[i]);
  }

  function isGroupEnd(i: number): boolean {
    return (
      i === messages.length - 1 ||
      isNewDay(i + 1) ||
      senderKey(messages[i + 1]) !== senderKey(messages[i])
    );
  }

  // A message made up of only emoji (and whitespace) renders large and
  // bare, the same visual shorthand Telegram/WhatsApp use — a lone 🎉
  // says more without a bubble crowding it.
  const EMOJI_ONLY_RE =
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|‍|️|\s){1,8}$/u;
  function isEmojiOnly(content: string): boolean {
    return content.trim().length > 0 && EMOJI_ONLY_RE.test(content);
  }
</script>

<svelte:head><title>{roomTitle || 'Room'} · Tombola</title></svelte:head>

<div class="relative">
  <!-- Header -->
  <div
    class="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-3 border-b border-black/[0.04] bg-bg-start/80 px-4 pb-3 pt-1 backdrop-blur-md"
  >
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

    <div class="min-w-0 flex-1">
      <h1 class="truncate font-display text-[17px] font-bold leading-tight text-ink">
        {roomTitle || 'Raffle room'}
      </h1>
      <p class="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium">
        {#if roomEnded}
          <span class="h-1.5 w-1.5 rounded-full bg-nav-inactive"></span>
          <span class="text-muted">Ended · read-only</span>
        {:else}
          <span class="live-dot h-1.5 w-1.5 rounded-full bg-primary"></span>
          <span class="text-primary-dark">Live chat</span>
        {/if}
      </p>
    </div>

    <button
      type="button"
      aria-label={soundMuted ? 'Unmute message sound' : 'Mute message sound'}
      on:click={toggleSound}
      class="tappable pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-muted shadow-card-light"
    >
      {#if soundMuted}
        <BellOff size={17} />
      {:else}
        <Bell size={17} class="text-primary-dark" />
      {/if}
    </button>
  </div>

  {#if loading}
    <div class="flex flex-col gap-3 pb-4 pt-2">
      <div class="flex items-end gap-2">
        <div class="skeleton h-7 w-7 shrink-0 rounded-full"></div>
        <div class="skeleton h-9 w-40 rounded-card"></div>
      </div>
      <div class="flex items-end justify-end gap-2">
        <div class="skeleton h-8 w-28 rounded-card"></div>
      </div>
      <div class="flex items-end gap-2">
        <div class="skeleton h-7 w-7 shrink-0 rounded-full"></div>
        <div class="skeleton h-14 w-52 rounded-card"></div>
      </div>
    </div>
  {:else if notAMember}
    <div class="flex flex-col items-center justify-center gap-3 rounded-card bg-card p-8 text-center shadow-card-light">
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
    <div>
      <div class="flex flex-col gap-1 px-0.5 pt-1 pb-16">
        {#each messages as message, i (message.id)}
            {@const groupStart = isGroupStart(i)}
            {@const groupEnd = isGroupEnd(i)}
            {@const bare = isEmojiOnly(message.content)}

            {#if isNewDay(i)}
              <div class="my-3 flex items-center justify-center" in:fade={{ duration: 150 }}>
                <span class="rounded-full bg-card/90 px-3 py-1 text-[10.5px] font-semibold text-muted shadow-card-light">
                  {dateLabel(message.createdAt)}
                </span>
              </div>
            {/if}

            <div
              class="flex items-end gap-2 {message.isMine ? 'justify-end' : 'justify-start'} {groupStart ? 'mt-2.5' : 'mt-0.5'}"
              in:fly={{ y: 10, duration: 220, easing: cubicOut }}
            >
              {#if !message.isMine}
                <div class="mb-0.5 h-7 w-7 shrink-0 self-end">
                  {#if groupStart}
                    {#if message.senderType === 'admin'}
                      <span
                        class="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-gold to-[#e0921a] text-white shadow-sm"
                      ><Ticket size={13} /></span>
                    {:else}
                      <img
                        src={message.senderTelegramPhotoUrl || (message.senderAvatarSeed ? dicebearAvatarUri(message.senderAvatarSeed) : '')}
                        alt=""
                        class="h-7 w-7 rounded-full border-2 border-card bg-bg-start object-cover shadow-sm"
                      />
                    {/if}
                  {/if}
                </div>
              {/if}

              <div class="flex max-w-[76%] flex-col {message.isMine ? 'items-end' : 'items-start'}">
                {#if groupStart && !message.isMine}
                  <p class="mb-0.5 flex items-baseline gap-1 px-1 text-[11px]">
                    <span class="font-bold {message.senderType === 'admin' ? 'text-gold' : 'text-ink'}">
                      {message.senderType === 'admin' ? 'Tombola Team' : message.senderName}
                    </span>
                    {#if message.senderPhoneMasked}
                      <span class="font-mono text-[10px] text-muted">{message.senderPhoneMasked}</span>
                    {/if}
                  </p>
                {/if}

                {#if bare}
                  <p class="px-1 text-[38px] leading-none" transition:scale={{ duration: 200, easing: backOut, start: 0.6 }}>
                    {message.content}
                  </p>
                {:else}
                  <div
                    class="chat-bubble relative px-3.5 py-2.5 {groupEnd
                      ? message.isMine
                        ? 'tail-right rounded-card rounded-br-md'
                        : 'tail-left rounded-card rounded-bl-md'
                      : 'rounded-card'} {message.senderType === 'admin'
                      ? 'bg-gradient-to-br from-gold-bg to-[#ffe6ab] text-ink'
                      : message.isMine
                        ? 'bg-gradient-to-br from-primary to-primary-dark text-[#0d221c]'
                        : 'bg-card text-ink shadow-card-light'}"
                  >
                    <p class="whitespace-pre-wrap break-words text-[14px] leading-snug">{message.content}</p>
                    <p
                      class="mt-1 flex items-center justify-end gap-0.5 text-[10px] {message.isMine || message.senderType === 'admin'
                        ? 'opacity-60'
                        : 'text-muted'}"
                    >
                      {timeLabel(message.createdAt)}
                      {#if message.isMine}<Check size={11} class="opacity-80" />{/if}
                    </p>
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span class="text-3xl">👋</span>
              <p class="text-[13px] font-medium text-muted">No messages yet — be the first to say hi</p>
            </div>
          {/each}
        <div bind:this={bottomSentinel} class="h-px w-full" aria-hidden="true"></div>
      </div>

      {#if unreadCount > 0}
        <button
          type="button"
          on:click={scrollToBottom}
          in:scale={{ duration: 180, easing: backOut, start: 0.8 }}
          class="tappable pressable sticky left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[12px] font-semibold text-white shadow-nav"
          style="bottom: calc(164px + var(--safe-bottom, 0px));"
        >
          <ChevronDown size={14} />
          {unreadCount} new message{unreadCount > 1 ? 's' : ''}
        </button>
      {/if}
    </div>

    {#if error}<p class="text-center text-[12px] text-coral-start">{error}</p>{/if}

    {#if readOnly}
      <p class="flex items-center justify-center gap-1.5 rounded-button bg-bg-start py-3 text-[12px] font-semibold text-muted">
        <Lock size={13} /> This room is read-only now that the raffle has ended.
      </p>
    {:else}
      <form
        on:submit|preventDefault={send}
        class="sticky z-20 flex items-center gap-2 rounded-button bg-card p-2 shadow-card-light transition-shadow duration-200 {inputFocused ? 'ring-2 ring-primary/40' : ''}"
        style="bottom: calc(92px + var(--safe-bottom, 0px));"
      >
        <input
          bind:this={inputEl}
          type="text"
          bind:value={draft}
          maxlength="500"
          placeholder="Text or emoji only — no links"
          on:focus={() => (inputFocused = true)}
          on:blur={() => (inputFocused = false)}
          class="h-11 min-w-0 flex-1 rounded-button border-none bg-bg-start px-3.5 font-sans text-[14px] text-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          class="pressable tappable send-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-[#0d221c] disabled:opacity-40 {draft.trim() ? 'send-armed' : ''}"
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

<style>
  .live-dot {
    animation: live-pulse 1.8s ease-in-out infinite;
  }

  @keyframes live-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(0, 211, 160, 0.5);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(0, 211, 160, 0);
    }
  }

  /* WhatsApp-style bubble tails — only on the last bubble of a
     consecutive run, at the outer-bottom corner. `background: inherit`
     copies the bubble's own gradient/solid fill onto the small triangle
     so it reads as one continuous shape. */
  .tail-right::before,
  .tail-left::before {
    content: '';
    position: absolute;
    bottom: 0;
    width: 10px;
    height: 12px;
    background: inherit;
  }

  .tail-right::before {
    right: -6px;
    clip-path: polygon(0 0, 0% 100%, 100% 100%);
  }

  .tail-left::before {
    left: -6px;
    clip-path: polygon(100% 0, 0% 100%, 100% 100%);
  }

  .send-btn {
    transition:
      transform 140ms var(--ease-out),
      box-shadow 200ms var(--ease-out);
  }

  .send-armed {
    box-shadow: 0 4px 14px rgba(0, 211, 160, 0.35);
  }

  @media (prefers-reduced-motion: reduce) {
    .live-dot {
      animation: none;
    }
  }
</style>
