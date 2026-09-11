<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { _ } from 'svelte-i18n';
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
  let demoOtpEnabled = false;

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
      const otp = await api.post<{ demoOtpEnabled?: boolean }>(
        '/auth/otp/request',
        { phone },
        { skipAuth: true }
      );
      startResendCooldown();
      if (otp.demoOtpEnabled) {
        demoOtpEnabled = true;
        code = '123456';
        await tick();
        await verifyCode(code);
      }
    } catch {
      error = $_('verify.resendError');
    } finally {
      resending = false;
    }
  }

  function backToLogin() {
    hapticLight();
    const params = new URLSearchParams();
    if (returnTo) params.set('returnTo', returnTo);
    // Replace, not push — same reasoning as login's navigation to verify:
    // this is a step backward within one sign-in action, not a new page,
    // so it must not leave a stale "verify" entry behind for the back
    // button to land on later.
    goto(`/login${params.toString() ? `?${params}` : ''}`, { replaceState: true });
  }

  onMount(async () => {
    phone = $page.url.searchParams.get('phone') ?? '';
    returnTo = $page.url.searchParams.get('returnTo') ?? '';
    demoOtpEnabled = $page.url.searchParams.get('demo') === '1';
    // A code was already sent by the login screen right before landing here.
    startResendCooldown();
    if (demoOtpEnabled) {
      code = '123456';
      // Paint the complete code without focusing an input, then continue
      // through the exact same verification endpoint as a manually typed OTP.
      await tick();
      await verifyCode(code);
    }
  });

  onDestroy(() => clearInterval(resendTimer));

  // No submit button — 6 digits is the whole input, so the code being
  // complete already tells us the user is done. One less tap.
  async function handleComplete(e: CustomEvent<string>) {
    await verifyCode(e.detail);
  }

  async function verifyCode(enteredCode: string) {
    if (loading) return;
    error = '';
    const parsed = verifyOtpSchema.safeParse({ phone, code: enteredCode });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? $_('verify.enterCode');
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
      showBanner($_('login.loginSuccessBanner'));
    } catch (err) {
      error = err instanceof ApiError ? $_('verify.invalidCode') : $_('login.networkError');
      // A demo deployment can immediately offer its known test code again;
      // a real OTP is cleared so the user can safely retype it.
      code = demoOtpEnabled ? '123456' : '';
      loading = false;
    }
  }
</script>

<div class="auth-screen safe-area-top safe-area-bottom relative flex min-h-dvh flex-col justify-center gap-8 overflow-y-auto p-6">
  <button
    type="button"
    aria-label={$_('verify.backToLoginAria')}
    on:click={backToLogin}
    class="safe-area-floating-top tappable pressable absolute left-4 flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-card-light"
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
    <h1 class="font-display text-[26px] font-semibold text-ink">{$_('verify.title')}</h1>
    <p class="max-w-[280px] text-sm text-muted">{$_('verify.sentCode', { values: { phone } })}</p>
  </div>

  <div
    class="flex flex-col items-center gap-4 rounded-card bg-card p-6 shadow-card"
    in:fly={{ y: 14, duration: 320, delay: 120, easing: cubicOut }}
  >
    <OtpInput bind:value={code} disabled={loading} on:complete={handleComplete} />
    {#if demoOtpEnabled && !error}
      <p class="text-center text-[11px] font-semibold text-primary-dark">{$_('verify.testCodeFilled')}</p>
    {/if}
    {#if error}
      <p class="text-[13px] text-coral-start">{error}</p>
    {:else if loading}
      <p class="text-[13px] text-muted">{$_('verify.verifying')}</p>
    {/if}

    <button
      type="button"
      disabled={resendCooldown > 0 || resending}
      on:click={resend}
      class="tappable min-h-11 px-3 text-[13px] font-semibold disabled:cursor-default {resendCooldown > 0
        ? 'text-muted'
        : 'text-primary-dark'}"
    >
      {resendCooldown > 0 ? $_('verify.resendIn', { values: { s: resendCooldown } }) : resending ? $_('verify.sending') : $_('verify.resendCode')}
    </button>
  </div>
</div>

<style>
  .auth-screen:focus-within {
    justify-content: flex-start;
    padding-top: max(88px, calc(var(--safe-top, 0px) + 64px));
  }
</style>
