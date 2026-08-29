<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { setAuth } from '$lib/stores/auth.store.js';
  import { adminLoginSchema, type AdminAuthResponse } from '$lib/schemas/index.js';
  import { ArrowRight, CheckCircle2, Dices, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-svelte';

  let phone = '';
  let password = '';
  let error = '';
  let loading = false;
  let showPassword = false;

  async function submit() {
    error = '';
    const parsed = adminLoginSchema.safeParse({ phone, password });
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter a valid email and password.';
      return;
    }

    loading = true;
    try {
      const result = await api.post<AdminAuthResponse>('/admin/auth/login', parsed.data, { skipAuth: true });
      setAuth(result.accessToken, result.admin);
      goto('/', { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError ? 'Those credentials could not be verified.' : 'Unable to reach Tombola. Check your connection and try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Super Admin sign in · Tombola</title></svelte:head>

<main class="grid min-h-[100dvh] bg-card lg:grid-cols-[minmax(420px,0.92fr)_minmax(520px,1.08fr)]">
  <section class="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
    <!-- Dotted World Map Background Overlay -->
    <div
      class="pointer-events-none absolute inset-0 bg-contain bg-center bg-no-repeat opacity-[0.18] mix-blend-screen"
      style="background-image: url('/images/world-map-dots.png'); background-position: center 50%; transform: scale(1.1);"
    ></div>

    <!-- Addis Ababa live hub pulse -->
    <div class="pointer-events-none absolute top-[52%] left-[56%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
      <span class="absolute inline-flex h-8 w-8 animate-ping rounded-full bg-primary opacity-30"></span>
      <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/30"></span>
    </div>

    <div class="absolute -right-28 -top-28 h-80 w-80 rounded-full border border-white/10"></div>
    <div class="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-primary/40"></div>


    <div class="relative flex items-center gap-3">
      <span class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary text-white"><Dices size={22} strokeWidth={2.2} /></span>
      <div><p class="text-base font-bold tracking-tight">Tombola</p><p class="text-xs text-white/55">Platform operations</p></div>
    </div>

    <div class="relative max-w-[520px]">
      <span class="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-bg"><ShieldCheck size={14} /> Secure control center</span>
      <h1 class="max-w-[500px] text-4xl font-bold leading-[1.08] tracking-[-0.035em] xl:text-5xl">Operate every draw with clarity and confidence.</h1>
      <p class="mt-6 max-w-[470px] text-[15px] leading-7 text-white/60">Manage raffles, registered players, winner claims and platform activity from one focused workspace.</p>
      <div class="mt-10 grid max-w-[470px] grid-cols-2 gap-x-8 gap-y-5 border-t border-white/10 pt-7 text-sm">
        <div class="flex items-center gap-2.5 text-white/75"><CheckCircle2 size={16} class="text-primary" /> Raffle oversight</div>
        <div class="flex items-center gap-2.5 text-white/75"><CheckCircle2 size={16} class="text-primary" /> User access</div>
        <div class="flex items-center gap-2.5 text-white/75"><CheckCircle2 size={16} class="text-primary" /> Winner claims</div>
        <div class="flex items-center gap-2.5 text-white/75"><CheckCircle2 size={16} class="text-primary" /> Audit visibility</div>
      </div>
    </div>

    <p class="relative text-xs text-white/35">Restricted to authorized Tombola Platform Owner accounts.</p>
  </section>

  <section class="flex min-h-[100dvh] items-center justify-center px-5 py-10 sm:px-10 lg:min-h-0">
    <form class="admin-reveal w-full max-w-[440px]" on:submit|preventDefault={submit}>
      <div class="mb-10 flex items-center gap-3 lg:hidden">
        <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-sidebar text-primary"><Dices size={20} /></span>
        <div><p class="font-bold text-ink">Tombola</p><p class="text-xs text-faint">Platform operations</p></div>
      </div>

      <span class="mb-5 flex h-12 w-12 items-center justify-center rounded-[16px] bg-primary-bg text-primary"><LockKeyhole size={21} /></span>
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-primary">Super Admin</p>
      <h2 class="mt-2 text-[30px] font-bold tracking-[-0.035em] text-ink sm:text-[34px]">Welcome back</h2>
      <p class="mt-2 text-sm leading-6 text-muted">Sign in to manage the Tombola platform.</p>

      <div class="mt-8 flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <label for="phone" class="text-xs font-bold text-ink">Admin phone number</label>
          <input id="phone" type="tel" inputmode="tel" bind:value={phone} autocomplete="username" placeholder="+251 91 100 0001" class="h-12 rounded-button border border-border bg-bg/60 px-4 text-sm text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none" />
        </div>
        <div class="flex flex-col gap-2">
          <label for="password" class="text-xs font-bold text-ink">Password</label>
          <div class="relative">
            <input id="password" type={showPassword ? 'text' : 'password'} bind:value={password} autocomplete="current-password" placeholder="Enter your password" class="h-12 w-full rounded-button border border-border bg-bg/60 px-4 pr-12 text-sm text-ink placeholder:text-faint focus:border-primary focus:bg-card focus:outline-none" />
            <button type="button" class="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:bg-bg hover:text-ink" aria-label={showPassword ? 'Hide password' : 'Show password'} on:click={() => (showPassword = !showPassword)}>
              {#if showPassword}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
            </button>
          </div>
        </div>
      </div>

      {#if error}<p class="mt-4 rounded-button border border-danger/15 bg-danger-bg px-3.5 py-3 text-xs font-medium text-danger" role="alert">{error}</p>{/if}

      <button type="submit" disabled={loading} class="admin-press mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-button bg-primary text-sm font-bold text-white shadow-[0_10px_24px_rgba(21,154,127,0.2)] disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? 'Signing in…' : 'Enter control center'}
        {#if !loading}<ArrowRight size={17} />{/if}
      </button>
      <p class="mt-5 text-center text-[11px] leading-5 text-faint">Protected administrative area. Activity may be recorded for platform security.</p>
    </form>
  </section>
</main>
