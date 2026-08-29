<script lang="ts">
  import { onMount } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { CircleHelp, Globe, LogIn, ShieldCheck, Ticket, Trophy } from 'lucide-svelte';
  import { auth } from '../stores/auth.store.js';
  import { locale, locales, initLocale, setLocale } from '../stores/locale.store.js';
  import { hapticLight } from '$lib/native/haptics.js';

  let helpOpen = false;
  let langOpen = false;

  onMount(initLocale);

  function toggleHelp() {
    hapticLight();
    helpOpen = !helpOpen;
    if (helpOpen) langOpen = false;
  }

  function toggleLang() {
    hapticLight();
    langOpen = !langOpen;
    if (langOpen) helpOpen = false;
  }

  function pickLocale(code: 'en' | 'am') {
    hapticLight();
    setLocale(code);
    langOpen = false;
  }

  function profileInitials(): string {
    const name = $auth.user?.fullName?.trim();
    if (name) {
      return name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
    }

    const phoneDigits = $auth.user?.phone.replace(/\D/g, '');
    return phoneDigits?.slice(-2) || 'ME';
  }

  $: profileName = $auth.user?.fullName?.trim() || 'your account';

  const popoverTransition = { duration: 160, start: 0.95, opacity: 0, easing: cubicOut };

  const steps = [
    { icon: Trophy, title: 'Choose a prize', detail: 'Open any live raffle.' },
    { icon: Ticket, title: 'Pick your tickets', detail: 'Each ticket is one entry.' },
    { icon: ShieldCheck, title: 'Pay and you’re in', detail: 'Ticket numbers appear right after payment.' },
  ];
</script>

<header class="flex items-center justify-between gap-2">
  <a href="/home" class="tappable flex min-w-0 items-center gap-3 text-inherit no-underline" aria-label="Tombola home">
    <img
      src="/images/tombola-logo-mark.svg"
      alt=""
      class="h-10 w-10 shrink-0 rounded-[14px] object-cover shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_5px_12px_-8px_rgba(0,122,95,0.65)]"
      width="40"
      height="40"
    />
    <div class="min-w-0">
      <p class="font-sans text-[17px] font-extrabold leading-none tracking-[-0.03em] text-ink">Tombola</p>
      <p class="mt-1 text-[10px] font-medium text-muted">Real prizes. Fair draws.</p>
    </div>
  </a>

  <div class="flex shrink-0 items-center gap-0.5">
    <!-- Help -->
    <div class="relative">
      <button
        type="button"
        on:click={toggleHelp}
        class="tappable pressable relative z-50 flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-black/5"
        aria-label="Help"
        aria-expanded={helpOpen}
      >
        <CircleHelp size={19} strokeWidth={2} />
      </button>

      {#if helpOpen}
        <button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close" on:click={() => (helpOpen = false)}></button>
        <div
          class="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-card border border-black/5 bg-card shadow-card"
          transition:scale={popoverTransition}
        >
          <p class="px-4 pb-2 pt-4 text-[12px] font-extrabold text-ink">How Tombola works</p>

          <div class="divide-y divide-dot-inactive/70 border-t border-dot-inactive/70">
            {#each steps as step, i (step.title)}
              <div class="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-4 py-2.5">
                <span class="flex h-7 w-7 items-center justify-center rounded-full bg-bg-start text-primary-dark">
                  <svelte:component this={step.icon} size={13} strokeWidth={2} />
                </span>
                <div class="min-w-0">
                  <p class="text-[11px] font-bold text-ink">{step.title}</p>
                  <p class="text-[10px] text-muted">{step.detail}</p>
                </div>
                <span class="text-[10px] font-extrabold text-primary-dark">0{i + 1}</span>
              </div>
            {/each}
          </div>

          <p class="border-t border-dot-inactive/70 px-4 py-2.5 text-[10px] leading-snug text-muted">
            Draws use a provably-fair random seed — verifiable, never rigged.
          </p>
        </div>
      {/if}
    </div>

    <!-- Language -->
    <div class="relative">
      <button
        type="button"
        on:click={toggleLang}
        class="tappable pressable relative z-50 flex h-9 items-center gap-1 rounded-full px-2 text-ink active:bg-black/5"
        aria-label="Change language"
        aria-expanded={langOpen}
      >
        <Globe size={17} strokeWidth={2} />
        <span class="text-[11px] font-bold uppercase">{$locale}</span>
      </button>

      {#if langOpen}
        <button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close" on:click={() => (langOpen = false)}></button>
        <div
          class="absolute right-0 top-full z-50 mt-2 w-36 origin-top-right overflow-hidden rounded-card border border-black/5 bg-card py-1 shadow-card"
          transition:scale={popoverTransition}
        >
          {#each locales as opt (opt.code)}
            <button
              type="button"
              on:click={() => pickLocale(opt.code)}
              class="tappable flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-semibold text-ink active:bg-black/5"
            >
              {opt.label}
              {#if $locale === opt.code}
                <span class="h-1.5 w-1.5 rounded-full bg-ink"></span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Sign in / Profile -->
    {#if $auth.isAuthenticated}
      <a
        href="/profile"
        on:click={hapticLight}
        class="profile-avatar tappable relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-card text-primary-dark no-underline shadow-[0_7px_16px_-11px_rgba(0,122,95,0.65),inset_0_1px_0_rgba(255,255,255,0.8)]"
        aria-label="Open profile for {profileName}"
        title="Profile"
        in:scale={{ duration: 260, start: 0.78, opacity: 0, easing: cubicOut }}
      >
        {#if $auth.user?.telegramPhotoUrl}
          <img src={$auth.user.telegramPhotoUrl} alt="" class="h-7 w-7 rounded-full object-cover" />
        {:else}
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-bg-start text-[10px] font-extrabold leading-none tracking-[-0.02em]">
            {profileInitials()}
          </span>
        {/if}
        <span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true"></span>
      </a>
    {:else}
      <a
        href="/login?returnTo=/profile"
        class="tappable pressable flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-black/5"
        aria-label="Sign in"
      >
        <LogIn size={18} strokeWidth={2} />
      </a>
    {/if}
  </div>
</header>

<style>
  .profile-avatar {
    transform: translate3d(0, 0, 0) scale(1);
    transition:
      transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
      border-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .profile-avatar:active {
    transform: translate3d(0, 1px, 0) scale(0.94);
  }

  @media (prefers-reduced-motion: reduce) {
    .profile-avatar {
      transition-duration: 1ms;
    }
  }
</style>
