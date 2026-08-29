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
  import { getTelegramMiniApp, loginWithTelegram } from '$lib/telegram.js';
  import { pendingTelegramLink } from '$lib/stores/telegram.store.js';
  import { setAuth } from '$lib/stores/auth.store.js';
  import { ChevronLeft, Send, ShieldCheck } from 'lucide-svelte';

  let phone = '';
  let error = '';
  let loading = false;
  let telegramLoading = false;
  let isTelegramMiniApp = false;

  $: returnTo = $page.url.searchParams.get('returnTo') ?? '';
  $: telegramLink = $pendingTelegramLink;

  onMount(() => { isTelegramMiniApp = Boolean(getTelegramMiniApp()); });

  function backToHome() { hapticLight(); goto('/home'); }

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
    } finally { loading = false; }
  }

  async function telegramLogin() {
    error = '';
    telegramLoading = true;
    hapticLight();
    try {
      const result = await loginWithTelegram();
      if (result.status === 'authenticated') {
        setAuth(result.accessToken, result.user);
        await goto(returnTo || '/home', { replaceState: true });
      } else {
        pendingTelegramLink.set({ token: result.telegramLinkToken, fullName: 'Telegram user', username: null, photoUrl: null });
      }
    } catch (err) {
      error = err instanceof ApiError ? 'Telegram login is not configured yet.' : 'Telegram login was cancelled or could not open.';
    } finally { telegramLoading = false; }
  }
</script>

<div class="safe-area-top safe-area-bottom relative flex min-h-dvh flex-col justify-center gap-7 p-6">
  <button type="button" aria-label="Back to home" on:click={backToHome} class="tappable pressable absolute left-4 top-[max(16px,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink shadow-card-light">
    <ChevronLeft size={22} />
  </button>

  <div class="flex flex-col items-center gap-3 text-center" in:fly={{ y: 14, duration: 320, delay: 60, easing: cubicOut }}>
    {#if telegramLink?.photoUrl}
      <img src={telegramLink.photoUrl} alt="" class="h-16 w-16 rounded-[20px] object-cover shadow-card" />
    {:else}
      <img src="/icons/icon-512.png" alt="Tombola" class="h-16 w-16 rounded-[20px] shadow-card" />
    {/if}
    <h1 class="font-display text-[26px] font-semibold text-ink">Tombola</h1>
    <p class="max-w-[300px] text-sm leading-relaxed text-muted">
      {telegramLink
        ? `Welcome${telegramLink.fullName ? `, ${telegramLink.fullName}` : ''}. Verify your phone once to secure your tickets.`
        : returnTo.startsWith('/raffles')
          ? "Sign in to confirm your tickets — you'll come right back."
          : 'One account for Tombola mobile and Telegram'}
    </p>
  </div>

  <form class="flex flex-col gap-4 rounded-card bg-card p-6 shadow-card" in:fly={{ y: 14, duration: 320, delay: 120, easing: cubicOut }} on:submit|preventDefault={submit}>
    {#if !isTelegramMiniApp && !telegramLink}
      <button type="button" on:click={telegramLogin} disabled={telegramLoading} class="pressable tappable flex h-[52px] w-full items-center justify-center gap-3 rounded-button bg-[#229ED9] px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(34,158,217,0.24)] disabled:opacity-60">
        {#if telegramLoading}
          <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
          Connecting…
        {:else}
          <Send size={19} fill="currentColor" />
          Continue with Telegram
        {/if}
      </button>
      <div class="flex items-center gap-3" aria-hidden="true">
        <span class="h-px flex-1 bg-dot-inactive"></span>
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">or use SMS</span>
        <span class="h-px flex-1 bg-dot-inactive"></span>
      </div>
    {:else if telegramLink}
      <div class="flex items-start gap-3 rounded-button bg-bg-start p-3.5 text-left">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary-dark"><ShieldCheck size={19} /></span>
        <div>
          <p class="text-[13px] font-semibold text-ink">Telegram connected</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted">Your phone keeps the 5-ticket limit fair across both apps.</p>
        </div>
      </div>
    {/if}

    <label for="phone" class="text-[13px] font-semibold text-muted">Phone number</label>
    <input id="phone" type="tel" inputmode="tel" placeholder="09XXXXXXXX" bind:value={phone} autocomplete="tel" class="h-13 rounded-button border-none bg-bg-start px-4 font-sans text-base text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] placeholder:text-muted focus:ring-primary" />
    {#if error}<p class="text-[13px] text-coral-start" role="alert">{error}</p>{/if}
    <Button type="submit" loading={loading}>{telegramLink ? 'Verify phone' : 'Send code'}</Button>
  </form>
</div>
