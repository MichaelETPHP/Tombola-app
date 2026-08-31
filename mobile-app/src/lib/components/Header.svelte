<script lang="ts">
  import { onMount } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Globe, LogIn } from 'lucide-svelte';
  import TikTokIcon from './TikTokIcon.svelte';
  import { auth } from '../stores/auth.store.js';
  import { locale, locales, initLocale, setLocale } from '../stores/locale.store.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { openExternal } from '$lib/native/browser.js';

  // TODO: replace with the real Tombola TikTok profile URL.
  const TIKTOK_URL = 'https://www.tiktok.com/@tombola';

  let langOpen = false;

  onMount(initLocale);

  function openTikTok() {
    hapticLight();
    openExternal(TIKTOK_URL);
  }

  function toggleLang() {
    hapticLight();
    langOpen = !langOpen;
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
    <!-- TikTok -->
    <button
      type="button"
      on:click={openTikTok}
      class="tappable pressable relative flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-black/5"
      aria-label="Follow Tombola on TikTok — we're live"
    >
      <TikTokIcon size={18} />
      <span class="live-dot absolute right-1 top-1 flex h-2.5 w-2.5" aria-hidden="true">
        <span class="live-dot-ping absolute inset-0 rounded-full bg-primary"></span>
        <span class="relative h-2.5 w-2.5 rounded-full border-2 border-card bg-primary"></span>
      </span>
    </button>

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

  /* Classic "live broadcast" indicator — a solid dot plus a ring that
     expands and fades outward from behind it, looping. */
  .live-dot-ping {
    animation: live-dot-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  @keyframes live-dot-ping {
    0% {
      transform: scale(1);
      opacity: 0.65;
    }
    75%,
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .profile-avatar {
      transition-duration: 1ms;
    }

    .live-dot-ping {
      animation: none;
      opacity: 0;
    }
  }
</style>
