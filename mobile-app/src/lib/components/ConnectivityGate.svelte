<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { CheckCircle2, RefreshCw, Signal, Wifi, WifiOff } from 'lucide-svelte';
  import { connectivity, checkConnectivity, startConnectivityMonitoring } from '$lib/stores/connectivity.store.js';
  import { language } from '$lib/stores/language.store.js';

  let showRestored = false;
  let hasLostConnection = false;
  let restoredTimer: ReturnType<typeof setTimeout> | undefined;

  const copy = {
    en: {
      checking: 'Checking your connection',
      checkingBody: 'YeneEta needs an internet connection to load the latest raffles.',
      offlineLabel: 'Connection problem',
      offlineTitle: "You're offline",
      offlineBody: 'Turn on Wi-Fi or mobile data, then try again. YeneEta cannot be used without an internet connection.',
      serviceTitle: 'YeneEta is not reachable',
      serviceBody: 'Your network is connected, but we cannot reach YeneEta right now. Please try again shortly.',
      waiting: 'Waiting for a connection',
      retry: 'Try again',
      restored: 'Connection restored',
      restoredBody: 'YeneEta is back online.',
    },
    am: {
      checking: 'የኢንተርኔት ግንኙነትዎን እያረጋገጥን ነው',
      checkingBody: 'የቅርብ ጊዜ ዕጣዎችን ለማሳየት የኔዕጣ የኢንተርኔት ግንኙነት ይፈልጋል።',
      offlineLabel: 'የግንኙነት ችግር',
      offlineTitle: 'ከኢንተርኔት ውጭ ነዎት',
      offlineBody: 'Wi-Fi ወይም የሞባይል ዳታን ያብሩና እንደገና ይሞክሩ። የኔዕጣ ያለ ኢንተርኔት አይሰራም።',
      serviceTitle: 'የኔዕጣን ማግኘት አልተቻለም',
      serviceBody: 'ኔትወርክዎ ተገናኝቷል፣ ነገር ግን የኔዕጣን አሁን ማግኘት አልቻልንም። እባክዎ ትንሽ ቆይተው ይሞክሩ።',
      waiting: 'ግንኙነት በመጠበቅ ላይ',
      retry: 'እንደገና ይሞክሩ',
      restored: 'ግንኙነቱ ተመልሷል',
      restoredBody: 'የኔዕጣ እንደገና መስመር ላይ ነው።',
    },
  } as const;

  $: text = copy[$language];
  $: isInitialCheck = !$connectivity.initialized && $connectivity.checking;
  // Let online launches render immediately while the first health check is
  // in flight. A confirmed offline result still blocks the app at once.
  $: isBlocked = $connectivity.initialized && !$connectivity.connected;
  $: isServiceProblem = $connectivity.reason === 'service-unreachable';

  onMount(() => {
    const unsubscribe = connectivity.subscribe((status) => {
      if (status.initialized && !status.connected) {
        hasLostConnection = true;
        showRestored = false;
        if (restoredTimer) clearTimeout(restoredTimer);
      } else if (status.initialized && status.connected && hasLostConnection) {
        hasLostConnection = false;
        showRestored = true;
        restoredTimer = setTimeout(() => (showRestored = false), 3200);
      }
    });

    void startConnectivityMonitoring();

    return () => {
      unsubscribe();
      if (restoredTimer) clearTimeout(restoredTimer);
    };
  });
</script>

{#if isBlocked}
  <div
    class="safe-area-top safe-area-bottom fixed inset-0 z-[70] flex min-h-[100dvh] flex-col bg-[#e9faf3] px-5 text-ink"
    role="alertdialog"
    aria-modal="true"
    aria-live="assertive"
    transition:fade={{ duration: 180 }}
  >
    <div class="mx-auto flex w-full max-w-md flex-1 flex-col">
      <div
        class="mt-2 flex items-center gap-3 rounded-[18px] border border-[#e9c8c5] bg-[#fff7f6] px-4 py-3 shadow-[0_10px_28px_-20px_rgba(90,35,30,0.35)]"
        class:border-[#ccebdd]={isInitialCheck}
        class:bg-white={isInitialCheck}
      >
        <div class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isInitialCheck ? 'bg-primary/15 text-primary-dark' : 'bg-[#fce1de] text-[#b4473d]'}`}>
          {#if isInitialCheck}<Signal size={19} strokeWidth={2.2} />{:else}<WifiOff size={19} strokeWidth={2.2} />{/if}
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-extrabold tracking-[-0.01em]">{isInitialCheck ? text.checking : text.offlineLabel}</p>
          <p class="mt-0.5 truncate text-[11px] font-medium text-muted">
            {isInitialCheck ? text.checkingBody : text.waiting}
          </p>
        </div>
        <span class="connection-dot ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-[#d9665b]" class:bg-primary={isInitialCheck}></span>
      </div>

      <div class="flex flex-1 flex-col items-center justify-center pb-14 text-center">
        <div class="relative mb-7 flex h-32 w-32 items-center justify-center">
          <span class="absolute h-32 w-32 rounded-full border border-primary/10 bg-white/55"></span>
          <span class="absolute h-24 w-24 rounded-full border border-primary/20 bg-white/75"></span>
          <span class="relative flex h-16 w-16 items-center justify-center rounded-[22px] bg-ink text-white shadow-[0_18px_35px_-18px_rgba(26,29,41,0.55)]">
            {#if isInitialCheck}
              <Wifi size={29} strokeWidth={2} class="text-primary" />
            {:else}
              <WifiOff size={29} strokeWidth={2} class="text-primary" />
            {/if}
          </span>
        </div>

        <p class="mb-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary-dark">YeneEta</p>
        <h1 class="max-w-[300px] text-[27px] font-extrabold leading-[1.12] tracking-[-0.035em]">
          {isInitialCheck ? text.checking : isServiceProblem ? text.serviceTitle : text.offlineTitle}
        </h1>
        <p class="mt-3 max-w-[330px] text-[14px] font-medium leading-6 text-muted">
          {isInitialCheck ? text.checkingBody : isServiceProblem ? text.serviceBody : text.offlineBody}
        </p>

        {#if !isInitialCheck}
          <button
            type="button"
            on:click={() => void checkConnectivity()}
            disabled={$connectivity.checking}
            class="pressable mt-7 flex h-13 min-w-44 items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-[14px] font-bold text-white shadow-[0_14px_30px_-18px_rgba(26,29,41,0.6)] disabled:opacity-70"
          >
            <RefreshCw size={17} strokeWidth={2.2} class={$connectivity.checking ? 'animate-spin' : ''} />
            <span>{$connectivity.checking ? text.checking : text.retry}</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{:else if showRestored}
  <div
    class="safe-area-top pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4"
    role="status"
    aria-live="polite"
    transition:fly={{ y: -28, duration: 320, easing: cubicOut }}
  >
    <div class="pointer-events-auto mt-2 flex w-full max-w-md items-center gap-3 rounded-[18px] border border-[#bce8d9] bg-white/95 px-4 py-3 shadow-[0_14px_35px_-20px_rgba(0,110,82,0.4)] backdrop-blur-md">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-dark">
        <CheckCircle2 size={20} strokeWidth={2.2} />
      </span>
      <div>
        <p class="text-[13px] font-extrabold tracking-[-0.01em] text-ink">{text.restored}</p>
        <p class="mt-0.5 text-[11px] font-medium text-muted">{text.restoredBody}</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .connection-dot {
    animation: connection-pulse 1.8s var(--ease-in-out) infinite;
  }

  @keyframes connection-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.78); }
  }

  @media (prefers-reduced-motion: reduce) {
    .connection-dot { animation: none; }
  }
</style>
