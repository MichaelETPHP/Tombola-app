<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.store.js';
  import { api } from '$lib/api/client.js';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import PullToRefresh from '$lib/components/PullToRefresh.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { createPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { initChatSound, playChatSound } from '$lib/native/chatSound.js';
  import { processRoomSummaries } from '$lib/stores/unreadRooms.js';
  import type { RoomSummary } from '$lib/schemas/index.js';

  const pullRefresh = createPullRefreshContext();

  // Runs everywhere in the authenticated shell — Home, Raffles, Wins,
  // Profile — not just inside a room, so a new message rings and badges
  // the Profile tab no matter what screen the user is actually looking at.
  const ROOMS_POLL_INTERVAL_MS = 5000;
  let roomsPollTimer: ReturnType<typeof setInterval> | undefined;

  function openRoomIdFromPath(pathname: string): string | undefined {
    return /^\/rooms\/([^/]+)/.exec(pathname)?.[1];
  }

  async function pollGlobalRooms() {
    if (!$auth.isAuthenticated) return;
    try {
      const res = await api.get<{ rooms: RoomSummary[] }>('/rooms');
      const openRoomId = openRoomIdFromPath($page.url.pathname);
      const hasNew = processRoomSummaries(res.rooms, openRoomId);
      if (hasNew) playChatSound();
    } catch {
      // A missed poll just gets picked up on the next tick.
    }
  }

  onMount(() => {
    initChatSound();
    roomsPollTimer = setInterval(pollGlobalRooms, ROOMS_POLL_INTERVAL_MS);
  });

  onDestroy(() => {
    clearInterval(roomsPollTimer);
  });

  // No blanket auth gate here — home, raffles, and raffle detail are all
  // guest-browsable. Screens that actually need an identity (wins, tickets,
  // profile) guard themselves, and the "buy" action asks for a phone number
  // at the moment it's needed rather than up front.
  //
  // In practice this branch is almost always masked by the boot splash
  // (app.html + lib/native/splash.ts), which only lifts once auth resolves —
  // this only becomes visible if the splash's 5s safety timeout fires early.
</script>

{#if $auth.isLoading}
  <main class="safe-area-top flex min-h-dvh flex-col gap-4 px-4 pt-5">
    <Skeleton class="h-8 w-32 rounded-full" />
    <Skeleton class="h-24 w-full rounded-card" />
    <Skeleton class="h-24 w-full rounded-card" />
    <Skeleton class="h-40 w-full rounded-card" />
  </main>
{:else}
  <main class="safe-area-top native-bottom-nav-clearance min-h-dvh px-4 pt-5">
    <PullToRefresh handler={pullRefresh}>
      <slot />
    </PullToRefresh>
  </main>
  <BottomNav />
{/if}
