<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api, ApiError } from '$lib/api/client.js';
  import { setAuth } from '$lib/stores/auth.store.js';
  import { showBanner } from '$lib/stores/banner.store.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import OtpInput from '$lib/components/OtpInput.svelte';
  import { verifyOtpSchema, type AuthResponse } from '$lib/schemas/index.js';
  import { ChevronLeft, MessageCircle } from 'lucide-svelte';
  import { pendingTelegramLink } from '$lib/stores/telegram.store.js';
  import { get } from 'svelte/store';

  let phone = '';
  let code = '';
  let error = '';
  let loading = false;
  let returnTo = '';

  const RESEND_COOLDOWN_S = 30;
  let resendCooldown = RESEND_COOLDOWN_S;
  let resendTimer: ReturnType<typeof setInterval> | undefined;
  let resending = false;

  function startResendCooldown() {
    resendCooldown = RESEND_COOLDOWN_S;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      resendCooldown -= 1;
      if (resendCooldown <= 0) clearInterval(resendTimer);
    }, 1000);
  }

  async function resend() {
    if (resendCooldown > 0 || resending) return;
    hapticLight();
    resending = true;
    try {
      await api.post('/auth/otp/request', { phone }, { skipAuth: true });
      startResendCooldown();
    } catch {
      error = 'Could not resend the code. Please try again.';
    } finally {
      resending = false;
    }
  }

  function backToLogin() {
    hapticLight();
    const params = new URLSearchParams();
    if (returnTo) params.set('returnTo', returnTo);
    goto(`/login${params.toString() ? `?${params}` : ''}`);
  }

  onMount(() => {
    phone = $page.url.searchParams.get('phone') ?? '';
    returnTo = $page.url.searchParams.get('returnTo') ?? '';
    // A code was already sent by the login screen right before landing here.
    startResendCooldown();
  });

  onDestroy(() => clearInterval(resendTimer));

  // No submit button — 6 digits is the whole input, so the code being
  // complete already tells us the user is done. One less tap.
  async function handleComplete(e: CustomEvent<string>) {
    const enteredCode = e.detail;
    error = '';
    const parsed = verifyOtpSchema.safeParse({ phone, code: enteredCode });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter the 6-digit code';
      return;
    }

    loading = true;
    try {
      const result = await api.post<AuthResponse>(
        '/auth/otp/verify',
        { phone, code: enteredCode, telegramLinkToken: get(pendingTelegramLink)?.token },
        { skipAuth: true }
      );
      setAuth(result.accessToken, result.user);
      pendingTelegramLink.set(null);
      hapticMedium();
      // Only the purchase flow has real state to resume (the pending
      // quantity, stashed before the phone/OTP detour). Wins/Profile are
      // just browsable tabs — landing straight there skips the "you're in"
      // moment, so the banner would show on top of Profile instead of Home.
      const destination = returnTo.startsWith('/raffles') ? returnTo : '/home';
      // Navigate first, *then* show the banner — otherwise it fires (and
      // fades) while still on this screen, before the destination has even
      // rendered. <Banner /> lives in the root layout, so it persists
      // across the navigation and shows correctly on top of the new page.
      await goto(destination, { replaceState: true });
      showBanner('Login successful');
    } catch (err) {
      error = err instanceof ApiError ? 'Invalid or expired code.' : 'Network error.';
      code = ''; // clears the boxes so the user can retype
      loading = false;
    }
  }
</script>

<div class="safe-area-top safe-area-bottom relative flex min-h-dvh flex-col justify-center gap-8 p-6">
  <button
    type="button"
    aria-label="Back to login"
    on:click={backToLogin}
    class="tappable pressable absolute left-4 top-[max(16px,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink shadow-card-light"
  >
    <ChevronLeft size={22} />
  </button>

  <div
    class="flex flex-col items-center gap-3 text-center"
    in:fly={{ y: 14, duration: 320, delay: 60, easing: cubicOut }}
  >
    <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-bg-start shadow-card">
      <MessageCircle size={30} class="text-primary-dark" />
    </div>
    <h1 class="font-display text-[26px] font-semibold text-ink">Verify your number</h1>
    <p class="max-w-[280px] text-sm text-muted">We sent a 6-digit code to {phone}</p>
  </div>

  <div
    class="flex flex-col items-center gap-4 rounded-card bg-card p-6 shadow-card"
    in:fly={{ y: 14, duration: 320, delay: 120, easing: cubicOut }}
  >
    <OtpInput bind:value={code} disabled={loading} on:complete={handleComplete} />
    {#if error}
      <p class="text-[13px] text-coral-start">{error}</p>
    {:else if loading}
      <p class="text-[13px] text-muted">Verifying…</p>
    {/if}

    <button
      type="button"
      disabled={resendCooldown > 0 || resending}
      on:click={resend}
      class="tappable text-[13px] font-semibold disabled:cursor-default {resendCooldown > 0
        ? 'text-muted'
        : 'text-primary-dark'}"
    >
      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : resending ? 'Sending…' : 'Resend code'}
    </button>
  </div>
</div>
