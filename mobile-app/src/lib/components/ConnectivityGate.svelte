<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { CheckCircle2, RefreshCw, Signal, Wifi, WifiOff } from 'lucide-svelte';
  import { connectivity, checkConnectivity, startConnectivityMonitoring } from '$lib/stores/connectivity.store.js';
  import { _ } from 'svelte-i18n';

  let showRestored = false;
  let hasLostConnection = false;
  let restoredTimer: ReturnType<typeof setTimeout> | undefined;

  $: text = {
    checking: $_('connectivity.checking'),
    checkingBody: $_('connectivity.checkingBody'),
    offlineLabel: $_('connectivity.offlineLabel'),
    offlineTitle: $_('connectivity.offlineTitle'),
    offlineBody: $_('connectivity.offlineBody'),
    serviceTitle: $_('connectivity.serviceTitle'),
    serviceBody: $_('connectivity.serviceBody'),
    waiting: $_('connectivity.waiting'),
    retry: $_('connectivity.retry'),
    restored: $_('connectivity.restored'),
    restoredBody: $_('connectivity.restoredBody'),
  };
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
