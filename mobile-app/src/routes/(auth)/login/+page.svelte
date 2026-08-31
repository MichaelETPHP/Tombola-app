<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api, ApiError } from '$lib/api/client.js';
  import Button from '$lib/components/Button.svelte';
  import { requestOtpSchema } from '$lib/schemas/index.js';
  import { hapticLight } from '$lib/native/haptics.js';
  import { authenticateTelegramMiniApp, getTelegramMiniApp } from '$lib/telegram.js';
  import { pendingTelegramLink } from '$lib/stores/telegram.store.js';
  import { setAuth } from '$lib/stores/auth.store.js';
  import { ChevronLeft, Send, ShieldCheck } from 'lucide-svelte';

  let phone = '';
  let error = '';
  let loading = false;
  let telegramLoading = false;
  let isTelegramMiniApp = false;
  let platformReady = false;

  $: returnTo = $page.url.searchParams.get('returnTo') ?? '';
  $: telegramLink = $pendingTelegramLink;

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
    const parsed = requestOtpSchema.safeParse({ phone });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter a valid phone number';
      return;
    }

    loading = true;
    try {
      await api.post('/auth/otp/request', { phone }, { skipAuth: true });
      const params = new URLSearchParams({ phone });
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
    telegramLoading = true;
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
      } else {
        pendingTelegramLink.set({ token: result.telegramLinkToken, ...result.telegramUser });
      }
    } catch (err) {
      error =
        err instanceof ApiError
          ? 'Telegram could not verify this session. Reopen Tombola from the bot and try again.'
          : 'Connection problem. Check your internet and try again.';
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
    {#if telegramLink?.photoUrl}
      <img
        src={telegramLink.photoUrl}
        alt=""
        class="h-16 w-16 rounded-[20px] object-cover shadow-card"
      />
    {:else}
      <img src="/icons/icon-512.png" alt="Tombola" class="h-16 w-16 rounded-[20px] shadow-card" />
    {/if}
    <h1 class="font-display text-[26px] font-semibold text-ink">Tombola</h1>
    <p class="max-w-[300px] text-sm leading-relaxed text-muted">
      {telegramLink
        ? `Welcome${telegramLink.fullName ? `, ${telegramLink.fullName}` : ''}. Verify your phone once to secure your tickets.`
        : isTelegramMiniApp
          ? 'Continue securely with the Telegram account you used to open Tombola.'
          : returnTo.startsWith('/raffles')
            ? "Sign in to confirm your tickets — you'll come right back."
            : 'Enter your phone number to start playing.'}
    </p>
  </div>

  {#if platformReady}
    {#if isTelegramMiniApp && !telegramLink}
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

        <button
          type="button"
          on:click={telegramLogin}
          disabled={telegramLoading}
          class="pressable tappable flex h-[52px] w-full items-center justify-center gap-3 rounded-button bg-[#229ED9] px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(34,158,217,0.24)] disabled:opacity-60"
        >
          {#if telegramLoading}
            <span
              class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            ></span>
            Connecting…
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
        {#if telegramLink}
          <div class="flex items-start gap-3 rounded-button bg-bg-start p-3.5 text-left">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary-dark"
            >
              <ShieldCheck size={19} />
            </span>
            <div>
              <p class="text-[13px] font-semibold text-ink">Telegram connected</p>
              <p class="mt-0.5 text-[11px] leading-relaxed text-muted">
                Verify your phone once to protect the 5-ticket limit across both apps.
              </p>
            </div>
          </div>
        {/if}

        <label for="phone" class="text-[13px] font-semibold text-muted">Phone number</label>
        <input
          id="phone"
          type="tel"
          inputmode="tel"
          placeholder="09XXXXXXXX"
          bind:value={phone}
          autocomplete="tel"
          class="h-13 rounded-button border-none bg-bg-start px-4 font-sans text-base text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] placeholder:text-muted focus:ring-primary"
        />
        {#if error}<p class="text-[13px] text-coral-start" role="alert">{error}</p>{/if}
        <Button type="submit" loading={loading}>{telegramLink ? 'Verify phone' : 'Send code'}</Button>
      </form>
    {/if}
  {:else}
    <div
      class="h-[188px] animate-pulse rounded-card bg-card/70 shadow-card"
      aria-label="Loading login options"
    ></div>
  {/if}
</div>
