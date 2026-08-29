<script lang="ts">
  import { auth } from '$lib/stores/auth.store.js';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import PullToRefresh from '$lib/components/PullToRefresh.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { createPullRefreshContext } from '$lib/stores/pullRefresh.js';

  const pullRefresh = createPullRefreshContext();

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
  <main class="safe-area-top min-h-dvh px-4 pb-[100px] pt-5">
    <PullToRefresh handler={pullRefresh}>
      <slot />
    </PullToRefresh>
  </main>
  <BottomNav />
{/if}
