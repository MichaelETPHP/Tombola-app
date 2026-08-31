<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fly, fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api, ApiError } from '$lib/api/client.js';
  import Button from '$lib/components/Button.svelte';
  import IosSpinner from '$lib/components/IosSpinner.svelte';
  import { hapticLight } from '$lib/native/haptics.js';
  import {
    authenticateTelegramMiniApp,
    getTelegramMiniApp,
    requestTelegramContact,
    completeTelegramContactLogin,
  } from '$lib/telegram.js';
  import { setAuth } from '$lib/stores/auth.store.js';
  import { ChevronLeft, Send, ShieldCheck, Check, X } from 'lucide-svelte';

  // Ethiopian mobile numbers are 9 digits after the leading 0
  // (0912345678) — the input only ever collects those digits; +251 is a
  // fixed, non-editable prefix shown next to it, never part of the typed
  // value. People type either with or without that leading 0 out of
  // habit, so both are accepted and normalized only once, right before
  // sending — not live as they type, which would make characters jump
  // around under their thumb.
  let phone = '';
  let error = '';
  let loading = false;
  let telegramLoading = false;
  let isTelegramMiniApp = false;
  let platformReady = false;
  let agreedToTerms = false;
  let termsOpen = false;
  let termsShake = false;

  // Inside the bot there is no OTP fallback at all — Telegram supplies
  // the phone number itself (see $lib/telegram.js), never a typed code.
  // 'idle' -> tap the button -> 'requesting_contact' (native Telegram
  // popup showing) -> 'polling' (waiting for the backend's webhook to
  // finish, since the number never reaches this page directly) ->
  // authenticated, or 'declined'/'timed_out' with a retry.
  type TelegramStep = 'idle' | 'requesting_contact' | 'polling' | 'declined' | 'timed_out';
  let telegramStep: TelegramStep = 'idle';
  let telegramUser: { fullName: string; username: string | null; photoUrl: string | null } | null = null;
  let cancelled = false;
  onDestroy(() => {
    cancelled = true;
  });

  const CONTACT_POLL_INTERVAL_MS = 1500;
  const CONTACT_POLL_TIMEOUT_MS = 25_000;

  function toE164(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    const national = digits.startsWith('0') ? digits.slice(1) : digits;
    return `+251${national}`;
  }

  function shakeTerms() {
    // Toggling straight back to true wouldn't retrigger the CSS animation
    // on a repeated failed tap — drop the class for a frame first.
    termsShake = false;
    requestAnimationFrame(() => {
      termsShake = true;
    });
    hapticLight();
  }

  function telegramErrorMessage(err: unknown): string {
    if (!(err instanceof ApiError)) return 'Connection problem. Check your internet and try again.';

    try {
      const response = JSON.parse(err.body) as { code?: string };
      if (response.code === 'AUTH_TELEGRAMEXPIRED') {
        return 'This Telegram session expired. Close Tombola and open it again from the bot menu.';
      }
      if (response.code === 'AUTH_TELEGRAMNOTCONFIGURED') {
        return 'Telegram login is temporarily unavailable. The bot configuration needs attention.';
      }
    } catch {
      // Fall through to the signed-session recovery message.
    }

    return 'Telegram could not verify this bot session. Reopen Tombola from the bot menu and try again.';
  }

  $: returnTo = $page.url.searchParams.get('returnTo') ?? '';

  onMount(() => {
    isTelegramMiniApp = Boolean(getTelegramMiniApp());
    platformReady = true;
  });

  function backToHome() {
    hapticLight();
    goto('/home');
  }

  async function submit() {
    error = '';
    if (!agreedToTerms) {
      shakeTerms();
      return;
    }

    const fullPhone = toE164(phone);
    if (fullPhone.length !== 13) {
      error = 'Enter a valid 9-digit phone number';
      return;
    }

    loading = true;
    try {
      await api.post('/auth/otp/request', { phone: fullPhone }, { skipAuth: true });
      const params = new URLSearchParams({ phone: fullPhone });
      if (returnTo) params.set('returnTo', returnTo);
      goto(`/verify?${params}`);
    } catch (err) {
      error = err instanceof ApiError ? 'Could not send code. Please try again.' : 'Network error.';
    } finally {
      loading = false;
    }
  }

  async function telegramLogin() {
    error = '';
    if (!agreedToTerms) {
      shakeTerms();
      return;
    }
    telegramLoading = true;
    telegramStep = 'idle';
    hapticLight();

    try {
      const telegram = getTelegramMiniApp();
      if (!telegram) {
        error = 'Open Tombola from the Telegram bot to continue.';
        return;
      }

      const result = await authenticateTelegramMiniApp(telegram);
      if (result.status === 'authenticated') {
        setAuth(result.accessToken, result.user);
        await goto(returnTo || '/home', { replaceState: true });
        return;
      }

      // First time this Telegram account has opened Tombola — get the
      // phone number the same way Telegram itself gets it: a native
      // one-tap share, never a typed code.
      telegramUser = result.telegramUser;
      telegramStep = 'requesting_contact';
      const shared = await requestTelegramContact(telegram);
      if (cancelled) return;
      if (!shared) {
        telegramStep = 'declined';
        return;
      }

      telegramStep = 'polling';
      const deadline = Date.now() + CONTACT_POLL_TIMEOUT_MS;
      while (Date.now() < deadline && !cancelled) {
        await new Promise((resolve) => setTimeout(resolve, CONTACT_POLL_INTERVAL_MS));
        const completion = await completeTelegramContactLogin(result.telegramLinkToken);
        if (cancelled) return;
        if (completion.status === 'authenticated') {
          setAuth(completion.accessToken, completion.user);
          await goto(returnTo || '/home', { replaceState: true });
          return;
        }
      }
      if (!cancelled) telegramStep = 'timed_out';
    } catch (err) {
      error = telegramErrorMessage(err);
    } finally {
      telegramLoading = false;
    }
  }
</script>

<div class="safe-area-top safe-area-bottom relative flex min-h-dvh flex-col justify-center gap-7 p-6">
  <button
    type="button"
    aria-label="Back to home"
    on:click={backToHome}
    class="tappable pressable absolute left-4 top-[max(44px,var(--safe-top))] flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink shadow-card-light"
  >
    <ChevronLeft size={22} />
  </button>

  <div
    class="flex flex-col items-center gap-3 text-center"
    in:fly={{ y: 14, duration: 320, delay: 60, easing: cubicOut }}
  >
    {#if telegramUser?.photoUrl}
      <img
        src={telegramUser.photoUrl}
        alt=""
        class="h-16 w-16 rounded-[20px] object-cover shadow-card"
      />
    {:else}
      <img src="/icons/icon-512.png" alt="Tombola" class="h-16 w-16 rounded-[20px] shadow-card" />
    {/if}
    <h1 class="font-display text-[26px] font-semibold text-ink">Tombola</h1>
    <p class="max-w-[300px] text-sm leading-relaxed text-muted">
      {isTelegramMiniApp
        ? telegramUser
          ? `Hi${telegramUser.fullName ? ` ${telegramUser.fullName}` : ''} — one tap to share your number and you're in.`
          : 'Continue securely with the Telegram account you used to open Tombola.'
        : returnTo.startsWith('/raffles')
          ? "Sign in to confirm your tickets — you'll come right back."
          : 'Enter your phone number to start playing.'}
    </p>
  </div>

  {#if platformReady}
    {#if isTelegramMiniApp}
      <section
        class="flex flex-col gap-4 rounded-card bg-card p-6 shadow-card"
        in:fly={{ y: 14, duration: 320, delay: 120, easing: cubicOut }}
        aria-label="Telegram login"
      >
        <div class="flex items-start gap-3 rounded-button bg-bg-start p-3.5 text-left">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#229ED9]"
          >
            <ShieldCheck size={19} />
          </span>
          <div>
            <p class="text-[13px] font-semibold text-ink">Verified Telegram session</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-muted">
              Tombola uses Telegram's signed identity to keep your account secure.
            </p>
          </div>
        </div>

        {#if error}<p class="text-[13px] text-coral-start" role="alert">{error}</p>{/if}

        {#if telegramStep === 'declined' || telegramStep === 'timed_out'}
          <div class="rounded-button bg-coral-start/10 p-3.5 text-left">
            <p class="text-[13px] font-semibold text-coral-start">
              {telegramStep === 'declined'
                ? "We need your phone number to continue — you can share it from Telegram's own prompt."
                : "Didn't hear back from Telegram in time."}
            </p>
            <p class="mt-1 text-[11px] leading-relaxed text-muted">
              Or open Tombola directly (outside the bot) to sign in with your phone number instead.
            </p>
          </div>
        {/if}

        <button
          type="button"
          on:click={telegramLogin}
          disabled={telegramLoading}
          class="pressable tappable flex h-[52px] w-full items-center justify-center gap-3 rounded-button bg-[#229ED9] px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(34,158,217,0.24)] disabled:opacity-60"
        >
          {#if telegramStep === 'polling'}
            <IosSpinner size={18} color="#ffffff" />
            Confirming your number…
          {:else if telegramStep === 'requesting_contact'}
            <IosSpinner size={18} color="#ffffff" />
            Waiting for Telegram…
          {:else if telegramStep === 'declined' || telegramStep === 'timed_out'}
            <Send size={19} fill="currentColor" />
            Try again
          {:else}
            <Send size={19} fill="currentColor" />
            Continue with Telegram
          {/if}
        </button>
      </section>
    {:else}
      <form
        class="flex flex-col gap-4 rounded-card bg-card p-6 shadow-card"
        in:fly={{ y: 14, duration: 320, delay: 120, easing: cubicOut }}
        on:submit|preventDefault={submit}
      >
        <label for="phone" class="text-[13px] font-semibold text-muted">Phone number</label>
        <div
          class="flex h-13 items-stretch rounded-button bg-bg-start ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] focus-within:ring-primary"
        >
          <span
            class="flex select-none items-center border-r border-ink/10 pl-4 pr-3 font-sans text-base font-semibold text-ink"
            aria-hidden="true"
          >
            +251
          </span>
          <input
            id="phone"
            type="tel"
            inputmode="numeric"
            placeholder="9XXXXXXXX"
            value={phone}
            on:input={(e) => (phone = e.currentTarget.value.replace(/\D/g, '').slice(0, 10))}
            autocomplete="tel-national"
            maxlength="10"
            class="h-full min-w-0 flex-1 rounded-r-button border-none bg-transparent pl-3 pr-4 font-sans text-base text-ink outline-none placeholder:text-muted"
          />
        </div>
        {#if error}<p class="text-[13px] text-coral-start" role="alert">{error}</p>{/if}
        <Button type="submit" loading={loading}>Send code</Button>
      </form>
    {/if}

    <div class="flex items-center justify-center gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={agreedToTerms}
        aria-label="Agree to Terms &amp; Conditions"
        on:click={() => (agreedToTerms = !agreedToTerms)}
        on:animationend={() => (termsShake = false)}
        class="tappable pressable flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150 {agreedToTerms
          ? 'border-primary-dark/60 bg-primary/25'
          : termsShake
            ? 'border-coral-start/70 bg-coral-start/20'
            : 'border-ink/15 bg-card'} {termsShake ? 'terms-shake' : ''}"
      >
        {#if agreedToTerms}
          <Check size={12} class="text-primary-dark" strokeWidth={3.5} />
        {/if}
      </button>
      <p
        class="text-[11.5px] leading-snug transition-colors duration-150 {termsShake
          ? 'font-semibold text-coral-start'
          : 'text-muted'}"
      >
        I agree to the
        <button
          type="button"
          class="tappable font-semibold text-primary-dark underline underline-offset-2"
          on:click={() => (termsOpen = true)}
        >Terms &amp; Conditions</button>
      </p>
    </div>
  {:else}
    <div
      class="h-[188px] animate-pulse rounded-card bg-card/70 shadow-card"
      aria-label="Loading login options"
    ></div>
  {/if}
</div>

{#if termsOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 cursor-default bg-black/40"
    aria-label="Close"
    on:click={() => (termsOpen = false)}
    transition:fade={{ duration: 160 }}
  ></button>
  <div
    class="no-scrollbar fixed inset-x-5 top-1/2 z-50 max-h-[70dvh] -translate-y-1/2 overflow-y-auto overscroll-y-contain rounded-card bg-card p-5 shadow-card"
    transition:scale={{ duration: 180, start: 0.95, opacity: 0, easing: cubicOut }}
  >
    <div class="mb-3 flex items-center justify-between">
      <p class="text-[15px] font-extrabold text-ink">Terms &amp; Conditions</p>
      <button
        type="button"
        aria-label="Close"
        class="tappable pressable flex h-8 w-8 items-center justify-center rounded-full bg-bg-start text-primary-dark"
        on:click={() => (termsOpen = false)}
      >
        <X size={16} />
      </button>
    </div>
    <ul class="flex flex-col gap-2.5 text-[12px] leading-snug text-muted">
      <li>You must be 18 or older to create a Tombola account.</li>
      <li>Your phone number is used only to send a one-time verification code and account-related updates.</li>
      <li>One account per phone number — the 5-ticket limit per raffle applies across every login method.</li>
      <li>Keep your verification code private; Tombola staff will never ask you for it.</li>
      <li>Accounts found using fraudulent phone numbers or payment methods may be suspended.</li>
    </ul>
    <div class="mt-4">
      <Button size="md" on:click={() => (termsOpen = false)}>Got it</Button>
    </div>
  </div>
{/if}

<style>
  .terms-shake {
    animation: terms-shake 400ms ease-in-out;
  }

  @keyframes terms-shake {
    10%,
    90% {
      transform: translateX(-1px);
    }
    20%,
    80% {
      transform: translateX(2px);
    }
    30%,
    50%,
    70% {
      transform: translateX(-4px);
    }
    40%,
    60% {
      transform: translateX(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .terms-shake {
      animation: none;
    }
  }
</style>
