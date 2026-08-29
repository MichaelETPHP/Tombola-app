<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api/client.js';
  import { auth, clearAuth } from '$lib/stores/auth.store.js';
  import { showBanner } from '$lib/stores/banner.store.js';
  import { hapticLight, hapticMedium } from '$lib/native/haptics.js';
  import Button from '$lib/components/Button.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListItemSkeleton from '$lib/components/ListItemSkeleton.svelte';
  import { formatEtb } from '$lib/utils/currency.js';
  import { getPullRefreshContext } from '$lib/stores/pullRefresh.js';
  import { User } from 'lucide-svelte';
  import { language, setLanguage, type AppLanguage } from '$lib/stores/language.store.js';

  const pullRefresh = getPullRefreshContext();

  interface PaymentHistoryItem {
    id: string;
    raffleId: string;
    raffleTitle: string;
    amount: number | string;
    ticketCount: number;
    ticketNumbers: number[];
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    gateway: string;
    createdAt: string;
  }

  const statusLabels: Record<PaymentHistoryItem['status'], string> = {
    completed: 'Paid',
    pending: 'Processing',
    failed: 'Failed',
    refunded: 'Refunded',
  };
  const statusColors: Record<PaymentHistoryItem['status'], string> = {
    completed: 'bg-bg-start text-primary-dark',
    pending: 'bg-gold-bg text-gold',
    failed: 'bg-pink-bg text-pink',
    refunded: 'bg-dot-inactive text-muted',
  };

  let fullName = $auth.user?.fullName ?? '';
  let preferredLanguage: AppLanguage = $auth.user?.preferredLanguage ?? $language;
  let saving = false;
  let error = '';

  $: initials = $auth.user?.fullName
    ? $auth.user.fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : '';

  let payments: PaymentHistoryItem[] = [];
  let paymentsLoading = true;
  let hasFetchedPayments = false;

  $: if (!$auth.isLoading && !$auth.isAuthenticated) {
    goto('/login?returnTo=/profile', { replaceState: true });
  }

  async function loadPayments() {
    paymentsLoading = true;
    try {
      const res = await api.get<{ payments: PaymentHistoryItem[] }>('/payments/mine');
      payments = res.payments;
    } catch (err) {
      console.error('Failed to load payment history', err);
    } finally {
      paymentsLoading = false;
    }
  }

  // Reactive rather than onMount — same reason as wins/tickets: the root
  // layout's silent-refresh can still be in flight when this page mounts.
  $: if ($auth.isAuthenticated && !hasFetchedPayments) {
    hasFetchedPayments = true;
    loadPayments();
  }

  $: pullRefresh.set($auth.isAuthenticated ? loadPayments : null);

  async function save() {
    error = '';
    saving = true;
    try {
      const res = await api.patch<{ user: typeof $auth.user }>('/users/me', {
        fullName: fullName.trim(),
        preferredLanguage,
      });
      auth.update((state) => ({ ...state, user: res.user }));
      setLanguage(preferredLanguage);
      hapticMedium();
      showBanner('Profile updated');
    } catch (err) {
      error = err instanceof ApiError ? 'Could not update profile.' : 'Network error.';
    } finally {
      saving = false;
    }
  }

  async function logout() {
    hapticLight();
    try {
      // Best-effort — clears the httpOnly refresh cookie server-side so
      // reopening the app doesn't silently sign back in. Local state below
      // still clears even if this fails; the user's intent to log out
      // shouldn't depend on the network.
      await api.post('/auth/logout', undefined, { skipAuth: true });
    } catch {
      // ignore — see above
    }
    clearAuth();
    goto('/login', { replaceState: true });
  }
</script>

{#if $auth.isLoading}
  <div class="flex flex-col gap-5">
    <Skeleton class="h-6 w-24 rounded-full" />
    <div class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
      <Skeleton class="h-11 w-full rounded-button" />
      <Skeleton class="h-11 w-full rounded-button" />
      <Skeleton class="h-11 w-full rounded-button" />
    </div>
  </div>
{:else if $auth.isAuthenticated}
  <div class="flex flex-col gap-5">
    <h1 class="font-display text-2xl font-semibold text-ink">Profile</h1>

    <div class="flex flex-col items-center gap-2 py-1">
      <div
        class="flex h-20 w-20 items-center justify-center rounded-full bg-bg-start text-2xl font-bold text-primary-dark shadow-card"
      >
        {#if $auth.user?.telegramPhotoUrl}
          <img src={$auth.user.telegramPhotoUrl} alt="" class="h-full w-full rounded-full object-cover" />
        {:else if initials}
          {initials}
        {:else}
          <User size={32} />
        {/if}
      </div>
    </div>

    <div class="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
      <label for="phone" class="text-[13px] font-semibold text-muted">Phone number</label>
      <input
        id="phone"
        type="text"
        value={$auth.user?.phone ?? ''}
        disabled
        class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-muted disabled:cursor-not-allowed"
      />

      <label for="name" class="text-[13px] font-semibold text-muted">Full name</label>
      <input
        id="name"
        type="text"
        bind:value={fullName}
        placeholder="Add your name"
        class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-ink outline-none ring-2 ring-transparent transition-[box-shadow] duration-150 ease-[var(--ease-out)] placeholder:text-muted focus:ring-primary"
      />

      <label for="language" class="text-[13px] font-semibold text-muted">Language</label>
      <select
        id="language"
        bind:value={preferredLanguage}
        class="h-12 rounded-button border-none bg-bg-start px-4 font-sans text-[15px] text-ink outline-none ring-2 ring-transparent focus:ring-primary"
      >
        <option value="en">English</option>
        <option value="am">አማርኛ</option>
      </select>

      {#if error}
        <p class="text-[13px] text-coral-start">{error}</p>
      {/if}

      <Button variant="secondary" loading={saving} on:click={save}>Save changes</Button>
    </div>

    <section class="flex flex-col gap-3">
      <h2 class="font-display text-lg font-semibold text-ink">Payment history</h2>
      {#if paymentsLoading}
        <div class="flex flex-col gap-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      {:else if payments.length === 0}
        <p class="text-[13px] text-muted">No purchases yet.</p>
      {:else}
        <div class="flex flex-col gap-3">
          {#each payments as payment (payment.id)}
            <a
              href="/raffles/{payment.raffleId}"
              class="tappable flex flex-col gap-2 rounded-card bg-card p-4 text-inherit no-underline shadow-card-light"
            >
              <div class="flex items-start justify-between gap-2">
                <span class="text-sm font-semibold text-ink">{payment.raffleTitle}</span>
                <span
                  class="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold {statusColors[
                    payment.status
                  ]}"
                >
                  {statusLabels[payment.status]}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs text-muted">
                <span>{new Date(payment.createdAt).toLocaleDateString()}</span>
                <span class="font-semibold text-ink">{formatEtb(payment.amount)} ETB</span>
              </div>
              {#if payment.ticketNumbers.length > 0}
                <div class="flex flex-wrap gap-1.5">
                  {#each payment.ticketNumbers as num (num)}
                    <span class="rounded-full bg-bg-start px-2 py-0.5 text-[11px] font-semibold text-primary-dark">
                      #{num}
                    </span>
                  {/each}
                </div>
              {/if}
            </a>
          {/each}
        </div>
      {/if}
    </section>

    <Button variant="danger" on:click={logout}>Log out</Button>
  </div>
{/if}
