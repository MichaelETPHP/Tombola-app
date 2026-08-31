<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client.js';
  import { auth } from '$lib/stores/auth.store.js';
  import ListItemSkeleton from '$lib/components/ListItemSkeleton.svelte';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ChevronLeft, MessageCircle } from 'lucide-svelte';
  import type { RoomSummary } from '$lib/schemas/index.js';

  const pullRefresh = getPullRefreshContext();

  let rooms: RoomSummary[] = [];
  let loading = true;
  let hasFetched = false;

  async function loadRooms() {
    loading = true;
    try {
      const res = await api.get<{ rooms: RoomSummary[] }>('/rooms');
      rooms = res.rooms;
    } catch (err) {
      console.error('Failed to load rooms', err);
    } finally {
      loading = false;
    }
  }

  $: if ($auth.isAuthenticated && !hasFetched) {
    hasFetched = true;
    loadRooms();
  }

  $: pullRefresh.set($auth.isAuthenticated ? loadRooms : null);

  function openRoom(raffleId: string) {
    hapticLight();
    goto(`/rooms/${raffleId}`);
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  }
</script>

<svelte:head><title>My Rooms · Tombola</title></svelte:head>

<div class="flex flex-col gap-5">
  <div class="flex items-center gap-3">
    <button
      type="button"
      aria-label="Back to profile"
      on:click={() => {
        hapticLight();
        goto('/profile');
      }}
      class="tappable pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-card-light"
    >
      <ChevronLeft size={20} />
    </button>
    <h1 class="font-display text-2xl font-semibold text-ink">My Rooms</h1>
  </div>

  {#if loading}
    <div class="flex flex-col gap-3">
      <ListItemSkeleton />
      <ListItemSkeleton />
      <ListItemSkeleton />
    </div>
  {:else if rooms.length === 0}
    <div class="flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center shadow-card-light">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-bg-start text-primary-dark">
        <MessageCircle size={22} />
      </span>
      <p class="text-sm font-semibold text-ink">No rooms yet</p>
      <p class="text-[13px] leading-relaxed text-muted">
        Buy a ticket for any raffle and its room opens here automatically — chat with other buyers about it.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each rooms as room, i (room.raffleId)}
        <button
          type="button"
          on:click={() => openRoom(room.raffleId)}
          class="tappable pressable flex w-full items-center gap-3 rounded-card bg-card p-4 text-left shadow-card-light"
          in:fly={{ y: 10, duration: 220, delay: i * 30, easing: cubicOut }}
        >
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-start text-primary-dark">
            <MessageCircle size={19} />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold text-ink">{room.title}</p>
              {#if room.lastMessageAt}
                <span class="shrink-0 text-[11px] text-muted">{timeAgo(room.lastMessageAt)}</span>
              {/if}
            </div>
            <p class="mt-0.5 truncate text-xs text-muted">
              {room.lastMessagePreview ?? 'No messages yet — say hi 👋'}
            </p>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
